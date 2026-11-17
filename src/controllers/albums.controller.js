import { Album, Photo, USER_PUBLIC_FIELDS } from '../models/index.js';
import { assertCanViewEvent, assertEventMember, isOrganizer, loadEvent } from '../services/access.js';
import { deleteAlbum as deleteAlbumCascade, deletePhotos } from '../services/cascade.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate, parsePagination, pick, sameId, searchFilter } from '../utils/helpers.js';

const AUTHOR_POPULATE = { path: 'author', select: USER_PUBLIC_FIELDS };

async function loadAlbum(id, user) {
  const album = await Album.findById(id);
  if (!album) throw ApiError.notFound('Album introuvable');
  const event = await loadEvent(album.event);
  assertCanViewEvent(event, user);
  return { album, event };
}

async function loadPhoto(id, user) {
  const photo = await Photo.findById(id);
  if (!photo) throw ApiError.notFound('Photo introuvable');
  const event = await loadEvent(photo.event);
  assertCanViewEvent(event, user);
  return { photo, event };
}

// ---------- Albums ----------

// POST /events/:eventId/albums : crée un album dans l'événement.
export async function createAlbum(req, res) {
  const event = await loadEvent(req.params.eventId);
  assertEventMember(event, req.user);
  const album = await Album.create({
    ...pick(req.body, ['name', 'description']),
    event: event._id,
    createdBy: req.user._id,
  });
  res.status(201).json({ data: album });
}

// GET /events/:eventId/albums : albums de l'événement.
export async function listAlbums(req, res) {
  const event = await loadEvent(req.params.eventId);
  assertCanViewEvent(event, req.user);
  const search = searchFilter(req.query.q, ['name', 'description']);
  const result = await paginate(Album, { event: event._id, ...(search ?? {}) }, parsePagination(req.query));
  res.json(result);
}

// GET /albums/:id : détail d'un album avec son nombre de photos.
export async function getAlbum(req, res) {
  const { album } = await loadAlbum(req.params.id, req.user);
  const photosCount = await Photo.countDocuments({ album: album._id });
  res.json({ data: { ...album.toObject(), photosCount } });
}

// PUT /albums/:id : par le créateur de l'album ou un organisateur.
export async function updateAlbum(req, res) {
  const { album, event } = await loadAlbum(req.params.id, req.user);
  if (!sameId(album.createdBy, req.user._id) && !isOrganizer(event, req.user)) {
    throw ApiError.forbidden('Seuls le créateur de l\'album ou un organisateur peuvent le modifier');
  }
  album.set(pick(req.body, ['name', 'description']));
  await album.save();
  res.json({ data: album });
}

// DELETE /albums/:id : supprime l'album, ses photos et leurs commentaires.
export async function deleteAlbum(req, res) {
  const { album, event } = await loadAlbum(req.params.id, req.user);
  if (!sameId(album.createdBy, req.user._id) && !isOrganizer(event, req.user)) {
    throw ApiError.forbidden('Seuls le créateur de l\'album ou un organisateur peuvent le supprimer');
  }
  await deleteAlbumCascade(album._id);
  res.status(204).end();
}

// ---------- Photos ----------

// POST /albums/:id/photos : règle 2.5, une photo est postée par un participant de l'événement.
export async function createPhoto(req, res) {
  const { album, event } = await loadAlbum(req.params.id, req.user);
  assertEventMember(event, req.user);
  const photo = await Photo.create({
    ...pick(req.body, ['url', 'caption']),
    album: album._id,
    event: event._id,
    author: req.user._id,
  });
  await photo.populate(AUTHOR_POPULATE);
  res.status(201).json({ data: photo });
}

// GET /albums/:id/photos : photos de l'album.
export async function listPhotos(req, res) {
  const { album } = await loadAlbum(req.params.id, req.user);
  const search = searchFilter(req.query.q, ['caption']);
  const result = await paginate(Photo, { album: album._id, ...(search ?? {}) }, parsePagination(req.query), {
    populate: AUTHOR_POPULATE,
  });
  res.json(result);
}

// GET /photos/:id
export async function getPhoto(req, res) {
  const { photo } = await loadPhoto(req.params.id, req.user);
  await photo.populate(AUTHOR_POPULATE);
  res.json({ data: photo });
}

// PUT /photos/:id : seul l'auteur modifie sa photo.
export async function updatePhoto(req, res) {
  const { photo } = await loadPhoto(req.params.id, req.user);
  if (!sameId(photo.author, req.user._id)) throw ApiError.forbidden('Seul l\'auteur peut modifier cette photo');
  photo.set(pick(req.body, ['url', 'caption']));
  await photo.save();
  await photo.populate(AUTHOR_POPULATE);
  res.json({ data: photo });
}

// DELETE /photos/:id : par l'auteur ou un organisateur, avec les commentaires de la photo.
export async function deletePhoto(req, res) {
  const { photo, event } = await loadPhoto(req.params.id, req.user);
  if (!sameId(photo.author, req.user._id) && !isOrganizer(event, req.user)) {
    throw ApiError.forbidden('Seuls l\'auteur ou un organisateur peuvent supprimer cette photo');
  }
  await deletePhotos({ _id: photo._id });
  res.status(204).end();
}
