import { ShoppingItem, USER_PUBLIC_FIELDS } from '../models/index.js';
import { assertEventMember, isOrganizer, loadEvent } from '../services/access.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate, parsePagination, pick, sameId, searchFilter } from '../utils/helpers.js';

const ITEM_FIELDS = ['name', 'quantity', 'arrivalTime'];
const USER_POPULATE = { path: 'user', select: USER_PUBLIC_FIELDS };

// Règle 2.8 : la shopping list n'est utilisable que si elle est activée sur l'événement,
// et seulement par les personnes qui participent à l'événement.
async function loadShoppingEvent(eventId, user) {
  const event = await loadEvent(eventId);
  assertEventMember(event, user);
  if (!event.shoppingListEnabled) {
    throw ApiError.conflict('La shopping list n\'est pas activée pour cet événement');
  }
  return event;
}

function assertArrivalBeforeEnd(item, event) {
  if (item.arrivalTime instanceof Date && item.arrivalTime > event.endDate) {
    throw ApiError.badRequest('L\'heure d\'arrivée doit être avant la fin de l\'événement');
  }
}

async function loadItem(id, user) {
  const item = await ShoppingItem.findById(id);
  if (!item) throw ApiError.notFound('Élément de shopping list introuvable');
  const event = await loadShoppingEvent(item.event, user);
  return { item, event };
}

// POST /events/:eventId/shopping-items : j'indique ce que j'apporte à l'événement.
export async function createItem(req, res) {
  const event = await loadShoppingEvent(req.params.eventId, req.user);
  const item = new ShoppingItem({ ...pick(req.body, ITEM_FIELDS), event: event._id, user: req.user._id });
  await item.validate();
  assertArrivalBeforeEnd(item, event);
  // L'index unique (événement + nom) garantit qu'une même chose n'est apportée qu'une fois.
  await item.save();
  await item.populate(USER_POPULATE);
  res.status(201).json({ data: item });
}

// GET /events/:eventId/shopping-items : la shopping list de l'événement.
export async function listItems(req, res) {
  const event = await loadShoppingEvent(req.params.eventId, req.user);
  const search = searchFilter(req.query.q, ['name']);
  const result = await paginate(ShoppingItem, { event: event._id, ...(search ?? {}) }, parsePagination(req.query), {
    sort: { arrivalTime: 1 },
    populate: USER_POPULATE,
  });
  res.json(result);
}

// GET /shopping-items/:id
export async function getItem(req, res) {
  const { item } = await loadItem(req.params.id, req.user);
  await item.populate(USER_POPULATE);
  res.json({ data: item });
}

// PUT /shopping-items/:id : seul celui qui apporte l'élément peut le modifier.
export async function updateItem(req, res) {
  const { item, event } = await loadItem(req.params.id, req.user);
  if (!sameId(item.user, req.user._id)) throw ApiError.forbidden('Seule la personne qui apporte cet élément peut le modifier');
  item.set(pick(req.body, ITEM_FIELDS));
  await item.validate();
  assertArrivalBeforeEnd(item, event);
  await item.save();
  await item.populate(USER_POPULATE);
  res.json({ data: item });
}

// DELETE /shopping-items/:id : par la personne qui apporte l'élément ou un organisateur.
export async function deleteItem(req, res) {
  const { item, event } = await loadItem(req.params.id, req.user);
  if (!sameId(item.user, req.user._id) && !isOrganizer(event, req.user)) {
    throw ApiError.forbidden('Seuls la personne qui apporte cet élément ou un organisateur peuvent le retirer');
  }
  await item.deleteOne();
  res.status(204).end();
}
