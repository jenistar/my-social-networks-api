import { Ticket, TicketType } from '../models/index.js';
import { assertOrganizer, loadEvent } from '../services/access.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, paginate, parsePagination, pick, searchFilter } from '../utils/helpers.js';

const TICKET_TYPE_FIELDS = ['name', 'amount', 'quantity'];
const BUYER_FIELDS = ['lastName', 'firstName', 'address'];

const withRemaining = (type) => {
  const plain = typeof type.toObject === 'function' ? type.toObject() : type;
  return { ...plain, remaining: plain.quantity - plain.sold };
};

// Règle 2.7 : seuls les événements publics peuvent avoir une billetterie.
async function loadPublicEvent(eventId) {
  const event = await loadEvent(eventId);
  if (event.visibility !== 'public') {
    throw ApiError.forbidden('La billetterie n\'existe que pour les événements publics');
  }
  return event;
}

async function loadTicketType(id) {
  const ticketType = await TicketType.findById(id);
  if (!ticketType) throw ApiError.notFound('Type de billet introuvable');
  return ticketType;
}

// ---------- Types de billets ----------

// POST /events/:eventId/ticket-types : un organisateur crée un type de billet.
export async function createTicketType(req, res) {
  const event = await loadPublicEvent(req.params.eventId);
  assertOrganizer(event, req.user);
  const ticketType = await TicketType.create({ ...pick(req.body, TICKET_TYPE_FIELDS), event: event._id });
  res.status(201).json({ data: withRemaining(ticketType) });
}

// GET /events/:eventId/ticket-types : route publique, pour qu'une personne extérieure voie les billets en vente.
export async function listTicketTypes(req, res) {
  const event = await loadPublicEvent(req.params.eventId);
  const search = searchFilter(req.query.q, ['name']);
  const result = await paginate(TicketType, { event: event._id, ...(search ?? {}) }, parsePagination(req.query), {
    sort: { amount: 1 },
  });
  result.data = result.data.map(withRemaining);
  res.json(result);
}

// GET /ticket-types/:id : route publique.
export async function getTicketType(req, res) {
  const ticketType = await loadTicketType(req.params.id);
  await loadPublicEvent(ticketType.event);
  res.json({ data: withRemaining(ticketType) });
}

// PUT /ticket-types/:id : modification par un organisateur.
export async function updateTicketType(req, res) {
  const ticketType = await loadTicketType(req.params.id);
  assertOrganizer(await loadEvent(ticketType.event), req.user);

  ticketType.set(pick(req.body, TICKET_TYPE_FIELDS));
  await ticketType.validate();
  if (ticketType.quantity < ticketType.sold) {
    throw ApiError.conflict(`${ticketType.sold} billets sont déjà vendus. La quantité ne peut pas être inférieure.`);
  }
  await ticketType.save();
  res.json({ data: withRemaining(ticketType) });
}

// DELETE /ticket-types/:id : impossible si des billets de ce type ont déjà été vendus.
export async function deleteTicketType(req, res) {
  const ticketType = await loadTicketType(req.params.id);
  assertOrganizer(await loadEvent(ticketType.event), req.user);
  if (await Ticket.exists({ ticketType: ticketType._id })) {
    throw ApiError.conflict('Des billets de ce type ont déjà été vendus. Annulez-les avant de supprimer le type.');
  }
  await ticketType.deleteOne();
  res.status(204).end();
}

// ---------- Billets ----------

// POST /events/:eventId/tickets : route publique. Une personne extérieure obtient un billet.
export async function purchaseTicket(req, res) {
  const event = await loadPublicEvent(req.params.eventId);
  if (event.endDate < new Date()) throw ApiError.conflict('Cet événement est terminé. La billetterie est fermée.');

  const ticketTypeId = assertObjectId(req.body?.ticketType, 'Le champ ticketType');
  const ticket = new Ticket({ ...pick(req.body, BUYER_FIELDS), event: event._id, ticketType: ticketTypeId });
  await ticket.validate();

  // Règle 2.7 : une personne extérieure ne peut obtenir qu'un seul billet.
  if (await Ticket.exists({ event: event._id, buyerKey: ticket.buyerKey })) {
    throw ApiError.conflict('Cette personne possède déjà un billet pour cet événement');
  }

  // On réserve une place de façon atomique : deux achats simultanés ne peuvent pas dépasser la quantité.
  const reserved = await TicketType.findOneAndUpdate(
    { _id: ticketTypeId, event: event._id, $expr: { $lt: ['$sold', '$quantity'] } },
    { $inc: { sold: 1 } },
    { returnDocument: 'after' },
  );
  if (!reserved) {
    const exists = await TicketType.exists({ _id: ticketTypeId, event: event._id });
    if (!exists) throw ApiError.notFound('Ce type de billet n\'existe pas pour cet événement');
    throw ApiError.conflict('Il n\'y a plus de billets disponibles pour ce type');
  }

  try {
    await ticket.save();
  } catch (error) {
    // L'enregistrement a échoué (par exemple un doublon simultané) : on libère la place réservée.
    await TicketType.updateOne({ _id: ticketTypeId }, { $inc: { sold: -1 } });
    throw error;
  }

  await ticket.populate({ path: 'ticketType', select: 'name amount' });
  res.status(201).json({ data: ticket });
}

// GET /events/:eventId/tickets : liste des billets vendus (organisateurs uniquement).
export async function listTickets(req, res) {
  const event = await loadEvent(req.params.eventId);
  assertOrganizer(event, req.user);

  const filter = { event: event._id, ...(searchFilter(req.query.q, ['lastName', 'firstName', 'address.city']) ?? {}) };
  if (req.query.ticketType !== undefined) filter.ticketType = assertObjectId(req.query.ticketType, 'Le paramètre ticketType');

  const result = await paginate(Ticket, filter, parsePagination(req.query), {
    sort: { purchasedAt: -1 },
    populate: { path: 'ticketType', select: 'name amount' },
  });
  res.json(result);
}

async function loadTicketAsOrganizer(req) {
  const ticket = await Ticket.findById(req.params.id);
  if (!ticket) throw ApiError.notFound('Billet introuvable');
  assertOrganizer(await loadEvent(ticket.event), req.user);
  return ticket;
}

// GET /tickets/:id : détail d'un billet (organisateurs uniquement).
export async function getTicket(req, res) {
  const ticket = await loadTicketAsOrganizer(req);
  await ticket.populate({ path: 'ticketType', select: 'name amount' });
  res.json({ data: ticket });
}

// PUT /tickets/:id : un organisateur corrige les données de la personne.
export async function updateTicket(req, res) {
  const ticket = await loadTicketAsOrganizer(req);
  const { address, ...identity } = pick(req.body, BUYER_FIELDS);
  ticket.set(identity);
  if (address !== undefined) {
    if (address === null || typeof address !== 'object') throw ApiError.badRequest('Le champ address doit être un objet');
    // On ne remplace que les parties de l'adresse qui sont envoyées.
    for (const [field, value] of Object.entries(pick(address, ['street', 'postalCode', 'city', 'country']))) {
      ticket.set(`address.${field}`, value);
    }
  }
  await ticket.save();
  await ticket.populate({ path: 'ticketType', select: 'name amount' });
  res.json({ data: ticket });
}

// DELETE /tickets/:id : un organisateur annule un billet. La place redevient disponible.
export async function deleteTicket(req, res) {
  const ticket = await loadTicketAsOrganizer(req);
  await ticket.deleteOne();
  await TicketType.updateOne({ _id: ticket.ticketType, sold: { $gt: 0 } }, { $inc: { sold: -1 } });
  res.status(204).end();
}
