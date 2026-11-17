import { Carpool, USER_PUBLIC_FIELDS } from '../models/index.js';
import { assertEventMember, isOrganizer, loadEvent } from '../services/access.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate, parsePagination, pick, sameId, searchFilter } from '../utils/helpers.js';

const CARPOOL_FIELDS = ['departureLocation', 'departureTime', 'price', 'availableSeats', 'maxDetourMinutes'];
const DRIVER_POPULATE = { path: 'driver', select: USER_PUBLIC_FIELDS };

// Bonus : le covoiturage n'est utilisable que s'il est activé sur l'événement,
// et seulement par les personnes qui participent à l'événement.
async function loadCarpoolEvent(eventId, user) {
  const event = await loadEvent(eventId);
  assertEventMember(event, user);
  if (!event.carpoolingEnabled) {
    throw ApiError.conflict('Le covoiturage n\'est pas activé pour cet événement');
  }
  return event;
}

function assertDepartureBeforeEnd(carpool, event) {
  if (carpool.departureTime instanceof Date && carpool.departureTime > event.endDate) {
    throw ApiError.badRequest('L\'heure de départ doit être avant la fin de l\'événement');
  }
}

async function loadCarpool(id, user) {
  const carpool = await Carpool.findById(id);
  if (!carpool) throw ApiError.notFound('Covoiturage introuvable');
  const event = await loadCarpoolEvent(carpool.event, user);
  return { carpool, event };
}

// POST /events/:eventId/carpools : j'indique que je me rends à l'événement en voiture.
export async function createCarpool(req, res) {
  const event = await loadCarpoolEvent(req.params.eventId, req.user);
  const carpool = new Carpool({ ...pick(req.body, CARPOOL_FIELDS), event: event._id, driver: req.user._id });
  await carpool.validate();
  assertDepartureBeforeEnd(carpool, event);
  await carpool.save();
  await carpool.populate(DRIVER_POPULATE);
  res.status(201).json({ data: carpool });
}

// GET /events/:eventId/carpools : covoiturages proposés pour l'événement.
export async function listCarpools(req, res) {
  const event = await loadCarpoolEvent(req.params.eventId, req.user);
  const filter = { event: event._id, ...(searchFilter(req.query.q, ['departureLocation']) ?? {}) };
  const maxPrice = Number(req.query.maxPrice);
  if (req.query.maxPrice !== undefined && Number.isFinite(maxPrice)) filter.price = { $lte: maxPrice };

  const result = await paginate(Carpool, filter, parsePagination(req.query), {
    sort: { departureTime: 1 },
    populate: DRIVER_POPULATE,
  });
  res.json(result);
}

// GET /carpools/:id
export async function getCarpool(req, res) {
  const { carpool } = await loadCarpool(req.params.id, req.user);
  await carpool.populate(DRIVER_POPULATE);
  res.json({ data: carpool });
}

// PUT /carpools/:id : seul le conducteur modifie son covoiturage.
export async function updateCarpool(req, res) {
  const { carpool, event } = await loadCarpool(req.params.id, req.user);
  if (!sameId(carpool.driver, req.user._id)) throw ApiError.forbidden('Seul le conducteur peut modifier ce covoiturage');
  carpool.set(pick(req.body, CARPOOL_FIELDS));
  await carpool.validate();
  assertDepartureBeforeEnd(carpool, event);
  await carpool.save();
  await carpool.populate(DRIVER_POPULATE);
  res.json({ data: carpool });
}

// DELETE /carpools/:id : par le conducteur ou un organisateur.
export async function deleteCarpool(req, res) {
  const { carpool, event } = await loadCarpool(req.params.id, req.user);
  if (!sameId(carpool.driver, req.user._id) && !isOrganizer(event, req.user)) {
    throw ApiError.forbidden('Seuls le conducteur ou un organisateur peuvent supprimer ce covoiturage');
  }
  await carpool.deleteOne();
  res.status(204).end();
}
