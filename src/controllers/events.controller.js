import { env } from '../config/env.js';
import {
  Album,
  Carpool,
  Event,
  Group,
  Photo,
  Poll,
  ShoppingItem,
  Thread,
  Ticket,
  TicketType,
  USER_PUBLIC_FIELDS,
} from '../models/index.js';
import {
  assertCanViewEvent,
  assertOrganizer,
  assertUsersExist,
  eventRole,
  groupRole,
  loadEvent,
  loadGroup,
} from '../services/access.js';
import { deleteEvent as deleteEventCascade } from '../services/cascade.js';
import { ApiError } from '../utils/ApiError.js';
import {
  assertObjectId,
  includesId,
  paginate,
  parseDate,
  parsePagination,
  pick,
  sameId,
  searchFilter,
  toIdList,
  unionIds,
  userIdsFromBody,
} from '../utils/helpers.js';

// Champs de l'étape 1 "Configuration de l'événement", plus les options activables.
const EVENT_FIELDS = [
  'name',
  'description',
  'startDate',
  'endDate',
  'location',
  'coverPhoto',
  'visibility',
  'shoppingListEnabled',
  'carpoolingEnabled',
];

const EVENT_POPULATE = [
  { path: 'organizers', select: USER_PUBLIC_FIELDS },
  { path: 'participants', select: USER_PUBLIC_FIELDS },
  { path: 'group', select: 'name type members' },
];

// Prépare un événement pour la réponse, avec ses organisateurs, ses participants et son groupe.
async function presentEvent(event, user) {
  await event.populate(EVENT_POPULATE);
  const data = event.toObject();
  if (data.group) {
    const { members, ...group } = data.group;
    // Le nom d'un groupe secret n'est jamais montré à une personne qui n'en est pas membre.
    data.group = group.type === 'secret' && !includesId(members, user._id) ? null : group;
  }
  return data;
}

async function sendEvent(res, event, user, status = 200) {
  res.status(status).json({ data: await presentEvent(event, user) });
}

// Les listes d'organisateurs et de participants sont modifiées par des opérations atomiques
// ($addToSet, $pull). Deux requêtes simultanées ne peuvent donc pas s'écraser l'une l'autre.
const updateMembers = (eventId, update, conditions = {}) =>
  Event.findOneAndUpdate({ _id: eventId, ...conditions }, update, { returnDocument: 'after' });

// Un organisateur n'est jamais ajouté en double dans la liste des participants.
const notOrganizers = (event, userIds) => userIds.filter((id) => !includesId(event.organizers, id));

// POST /events : crée un événement. Le créateur devient organisateur.
// Si "group" est renseigné, tous les membres du groupe sont invités automatiquement.
export async function createEvent(req, res) {
  const organizers = unionIds([req.user._id], toIdList(req.body?.organizers, 'organizers'));
  let participants = toIdList(req.body?.participants, 'participants');
  let group = null;

  if (req.body?.group !== undefined && req.body.group !== null) {
    group = await loadGroup(assertObjectId(req.body.group, 'Identifiant du groupe'), req.user);
    const role = groupRole(group, req.user);
    if (role === 'none') throw ApiError.forbidden('Vous devez être membre du groupe pour y créer un événement');
    if (role === 'member' && !group.allowMembersToCreateEvents) {
      throw ApiError.forbidden('Dans ce groupe, seuls les administrateurs peuvent créer des événements');
    }
    participants = unionIds(participants, group.members);
  }

  await assertUsersExist(unionIds(organizers, participants));

  const event = await Event.create({
    ...pick(req.body, EVENT_FIELDS),
    organizers,
    participants,
    group: group ? group._id : null,
    createdBy: req.user._id,
  });
  await sendEvent(res, event, req.user, 201);
}

// GET /events : recherche parmi les événements publics et ceux où l'on est invité.
export async function listEvents(req, res) {
  const me = req.user._id;
  const { q, visibility, group, role, mine } = req.query;
  const and = [{ $or: [{ visibility: 'public' }, { organizers: me }, { participants: me }] }];

  const search = searchFilter(q, ['name', 'description', 'location']);
  if (search) and.push(search);
  if (visibility === 'public' || visibility === 'private') and.push({ visibility });
  if (group !== undefined) and.push({ group: assertObjectId(group, 'Identifiant du groupe') });

  // Événements qui se déroulent (au moins en partie) entre "from" et "to".
  const from = parseDate(req.query.from, 'Le paramètre from');
  const to = parseDate(req.query.to, 'Le paramètre to');
  if (from) and.push({ endDate: { $gte: from } });
  if (to) and.push({ startDate: { $lte: to } });

  if (role === 'organizer') and.push({ organizers: me });
  else if (role === 'participant') and.push({ participants: me });
  else if (mine === 'true') and.push({ $or: [{ organizers: me }, { participants: me }] });

  const result = await paginate(Event, { $and: and }, parsePagination(req.query), { sort: { startDate: 1 } });
  // Dans une liste, on renvoie des compteurs plutôt que la liste complète des participants.
  result.data = result.data.map(({ participants, ...event }) => ({
    ...event,
    organizersCount: event.organizers.length,
    participantsCount: participants.length,
    myRole: eventRole({ organizers: event.organizers, participants }, req.user),
  }));
  res.json(result);
}

// GET /events/:id : détail d'un événement avec ses organisateurs et ses participants.
export async function getEvent(req, res) {
  const event = await loadEvent(req.params.id);
  assertCanViewEvent(event, req.user);
  await sendEvent(res, event, req.user);
}

// PUT /events/:id : modification par un organisateur.
export async function updateEvent(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);

  const changes = pick(req.body, EVENT_FIELDS);
  // Règle 2.7 : la billetterie n'existe que sur un événement public.
  if (changes.visibility === 'private' && event.visibility === 'public' && (await TicketType.exists({ event: event._id }))) {
    throw ApiError.conflict('Cet événement possède une billetterie. Il doit rester public tant que des types de billets existent.');
  }

  event.set(changes);
  await event.save();
  await sendEvent(res, event, req.user);
}

// DELETE /events/:id : suppression par un organisateur, avec tout le contenu de l'événement.
export async function deleteEvent(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);
  await deleteEventCascade(event._id);
  res.status(204).end();
}

// GET /events/:id/participants : organisateurs et participants de l'événement.
export async function listParticipants(req, res) {
  const event = await loadEvent(req.params.id);
  assertCanViewEvent(event, req.user);
  await event.populate(EVENT_POPULATE.slice(0, 2));
  res.json({
    data: { organizers: event.organizers, participants: event.participants },
    meta: { organizersCount: event.organizers.length, participantsCount: event.participants.length },
  });
}

// POST /events/:id/participants : un organisateur invite un ou plusieurs utilisateurs.
export async function addParticipants(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);
  const userIds = userIdsFromBody(req.body);
  await assertUsersExist(userIds);

  const updated = await updateMembers(event._id, { $addToSet: { participants: { $each: notOrganizers(event, userIds) } } });
  await sendEvent(res, updated, req.user);
}

// POST /events/:id/join : rejoindre soi-même un événement public.
export async function joinEvent(req, res) {
  const event = await loadEvent(req.params.id);
  if (event.visibility !== 'public') {
    throw ApiError.forbidden('Cet événement est privé. Un organisateur doit vous inviter.');
  }
  const updated = await updateMembers(event._id, {
    $addToSet: { participants: { $each: notOrganizers(event, [String(req.user._id)]) } },
  });
  await sendEvent(res, updated, req.user);
}

// DELETE /events/:id/participants/:userId : un organisateur retire un participant, ou un participant se retire.
export async function removeParticipant(req, res) {
  const event = await loadEvent(req.params.id);
  const { userId } = req.params;
  if (!sameId(userId, req.user._id)) assertOrganizer(event, req.user);

  if (includesId(event.organizers, userId)) {
    throw ApiError.conflict('Cet utilisateur est organisateur. Retirez d\'abord son rôle d\'organisateur.');
  }
  if (!includesId(event.participants, userId)) throw ApiError.notFound('Cet utilisateur ne participe pas à l\'événement');

  await updateMembers(event._id, { $pull: { participants: userId } });
  res.status(204).end();
}

// POST /events/:id/organizers : un organisateur nomme un autre organisateur.
export async function addOrganizers(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);
  const userIds = userIdsFromBody(req.body);
  await assertUsersExist(userIds);

  const updated = await updateMembers(event._id, {
    $addToSet: { organizers: { $each: userIds } },
    $pullAll: { participants: userIds },
  });
  await sendEvent(res, updated, req.user);
}

// DELETE /events/:id/organizers/:userId : retire le rôle d'organisateur (la personne reste participante).
export async function removeOrganizer(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);
  const { userId } = req.params;

  if (!includesId(event.organizers, userId)) throw ApiError.notFound('Cet utilisateur n\'est pas organisateur de l\'événement');

  // La condition "organizers.1 existe" garantit qu'il reste au moins un organisateur après le retrait.
  const updated = await updateMembers(
    event._id,
    { $pull: { organizers: userId }, $addToSet: { participants: userId } },
    { organizers: userId, 'organizers.1': { $exists: true } },
  );
  if (!updated) throw ApiError.conflict('Un événement doit garder au moins un organisateur');
  await sendEvent(res, updated, req.user);
}

// POST /events/:id/invite-group : invite en un clic tous les membres du groupe de l'événement.
export async function inviteGroupMembers(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);
  if (!event.group) throw ApiError.conflict('Cet événement n\'a pas été créé dans un groupe');

  const group = await Group.findById(event.group);
  const members = group ? group.members.map(String) : [];
  const updated = await updateMembers(event._id, { $addToSet: { participants: { $each: notOrganizers(event, members) } } });

  const invitedCount = updated.participants.length - event.participants.length;
  res.json({ data: await presentEvent(updated, req.user), meta: { invitedCount } });
}

// GET /events/:id/share : liens de partage vers les autres réseaux sociaux.
// Réservé aux organisateurs d'un événement créé dans un groupe public (cahier des charges 1.2).
export async function getShareLinks(req, res) {
  const event = await loadEvent(req.params.id);
  assertOrganizer(event, req.user);

  const group = event.group ? await Group.findById(event.group) : null;
  if (!group || group.type !== 'public') {
    throw ApiError.conflict('Le partage sur les autres réseaux sociaux est réservé aux événements d\'un groupe public');
  }

  const url = `${env.publicAppUrl}/events/${event._id}`;
  const date = event.startDate.toLocaleDateString('fr-FR', { dateStyle: 'long', timeZone: 'Europe/Paris' });
  const text = `${event.name}, le ${date} à ${event.location}`;
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);

  res.json({
    data: {
      url,
      text,
      links: {
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        linkedin: `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`,
        whatsapp: `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`,
        telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
        email: `mailto:?subject=${encodeURIComponent(event.name)}&body=${encodeURIComponent(`${text}\n${url}`)}`,
      },
    },
  });
}

// GET /events/:id/summary : tableau de bord de l'événement, avec les compteurs de chaque module.
export async function getEventSummary(req, res) {
  const event = await loadEvent(req.params.id);
  assertCanViewEvent(event, req.user);
  const filter = { event: event._id };

  const [threads, albums, photos, polls, ticketTypes, ticketsSold, shoppingItems, carpools] = await Promise.all([
    Thread.countDocuments(filter),
    Album.countDocuments(filter),
    Photo.countDocuments(filter),
    Poll.countDocuments(filter),
    TicketType.find(filter).select('quantity').lean(),
    Ticket.countDocuments(filter),
    ShoppingItem.countDocuments(filter),
    Carpool.countDocuments(filter),
  ]);
  const ticketsTotal = ticketTypes.reduce((sum, type) => sum + type.quantity, 0);

  res.json({
    data: {
      event: pick(event, ['_id', 'name', 'startDate', 'endDate', 'location', 'visibility']),
      myRole: eventRole(event, req.user),
      organizersCount: event.organizers.length,
      participantsCount: event.participants.length,
      threadsCount: threads,
      albumsCount: albums,
      photosCount: photos,
      pollsCount: polls,
      ticketing: {
        enabled: ticketTypes.length > 0,
        ticketTypesCount: ticketTypes.length,
        ticketsSold,
        ticketsRemaining: ticketsTotal - ticketsSold,
      },
      shoppingList: { enabled: event.shoppingListEnabled, itemsCount: shoppingItems },
      carpooling: { enabled: event.carpoolingEnabled, carpoolsCount: carpools },
    },
  });
}
