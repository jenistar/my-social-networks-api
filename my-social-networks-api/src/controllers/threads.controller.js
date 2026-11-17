import { Event, Group, Message, Thread, USER_PUBLIC_FIELDS } from '../models/index.js';
import {
  assertCanSeeGroupContent,
  assertCanViewEvent,
  assertGroupAdmin,
  assertOrganizer,
  loadEvent,
  loadGroup,
  loadThread,
  threadAccess,
} from '../services/access.js';
import { deleteMessages, deleteThreads } from '../services/cascade.js';
import { ApiError } from '../utils/ApiError.js';
import { assertObjectId, paginate, parsePagination, sameId, searchFilter } from '../utils/helpers.js';

const AUTHOR_POPULATE = { path: 'author', select: USER_PUBLIC_FIELDS };

// ---------- Fils de discussion ----------

// POST /threads : crée un fil lié à un groupe OU à un événement (jamais les deux).
export async function createThread(req, res) {
  const { title, group: groupId, event: eventId } = req.body ?? {};
  if (Boolean(groupId) === Boolean(eventId)) {
    throw ApiError.badRequest('Indiquez soit "group", soit "event". Un fil ne peut pas être lié aux deux.');
  }

  if (groupId) {
    const group = await loadGroup(assertObjectId(groupId, 'Identifiant du groupe'), req.user);
    assertGroupAdmin(group, req.user);
  } else {
    const event = await loadEvent(assertObjectId(eventId, 'Identifiant de l\'événement'));
    assertOrganizer(event, req.user);
  }

  const thread = await Thread.create({ title, group: groupId || null, event: eventId || null, createdBy: req.user._id });
  res.status(201).json({ data: thread });
}

// GET /threads : fils d'un groupe (?group=), d'un événement (?event=) ou de tous mes groupes et événements.
export async function listThreads(req, res) {
  const { group: groupId, event: eventId, q } = req.query;
  if (groupId !== undefined && eventId !== undefined) {
    throw ApiError.badRequest('Filtrez par "group" ou par "event", pas les deux');
  }

  let filter;
  if (groupId !== undefined) {
    const group = await loadGroup(assertObjectId(groupId, 'Identifiant du groupe'), req.user);
    assertCanSeeGroupContent(group, req.user);
    filter = { group: group._id };
  } else if (eventId !== undefined) {
    const event = await loadEvent(assertObjectId(eventId, 'Identifiant de l\'événement'));
    assertCanViewEvent(event, req.user);
    filter = { event: event._id };
  } else {
    const me = req.user._id;
    const [groupIds, eventIds] = await Promise.all([
      Group.distinct('_id', { members: me }),
      Event.distinct('_id', { $or: [{ organizers: me }, { participants: me }] }),
    ]);
    filter = { $or: [{ group: { $in: groupIds } }, { event: { $in: eventIds } }] };
  }

  const search = searchFilter(q, ['title']);
  const result = await paginate(Thread, search ? { $and: [filter, search] } : filter, parsePagination(req.query), {
    sort: { createdAt: 1 },
  });
  res.json(result);
}

// GET /threads/:id : détail d'un fil avec le nombre de messages et les droits du demandeur.
export async function getThread(req, res) {
  const { thread, access } = await loadThread(req.params.id, req.user);
  const messagesCount = await Message.countDocuments({ thread: thread._id });
  res.json({ data: { ...thread.toObject(), messagesCount, permissions: access } });
}

// PUT /threads/:id : seul le titre est modifiable. Le rattachement au groupe ou à l'événement est définitif.
export async function updateThread(req, res) {
  const { thread, access } = await loadThread(req.params.id, req.user);
  if (!access.canManage) throw ApiError.forbidden('Action réservée aux administrateurs du groupe ou aux organisateurs de l\'événement');
  if (req.body?.title !== undefined) thread.title = req.body.title;
  await thread.save();
  res.json({ data: thread });
}

// DELETE /threads/:id : supprime le fil, ses messages et leurs commentaires.
export async function deleteThread(req, res) {
  const { thread, access } = await loadThread(req.params.id, req.user);
  if (!access.canManage) throw ApiError.forbidden('Action réservée aux administrateurs du groupe ou aux organisateurs de l\'événement');

  // Cahier des charges 1.2 : chaque groupe met un fil de discussion à disposition de ses membres.
  if (thread.group && (await Thread.countDocuments({ group: thread.group })) === 1) {
    throw ApiError.conflict('Un groupe doit toujours garder au moins un fil de discussion');
  }

  await deleteThreads({ _id: thread._id });
  res.status(204).end();
}

// ---------- Messages ----------

async function loadMessage(id, user) {
  const message = await Message.findById(id);
  if (!message) throw ApiError.notFound('Message introuvable');
  const thread = await Thread.findById(message.thread);
  const access = await threadAccess(thread, user);
  if (!access.canRead) throw ApiError.forbidden('Vous n\'avez pas accès à ce fil de discussion');
  return { message, access };
}

// GET /threads/:id/messages : messages du fil, du plus récent au plus ancien.
export async function listMessages(req, res) {
  const { thread } = await loadThread(req.params.id, req.user);
  const search = searchFilter(req.query.q, ['content']);
  const filter = { thread: thread._id, ...(search ?? {}) };
  const result = await paginate(Message, filter, parsePagination(req.query), { populate: AUTHOR_POPULATE });
  res.json(result);
}

// POST /threads/:id/messages : publie un message dans le fil.
export async function createMessage(req, res) {
  const { thread, access } = await loadThread(req.params.id, req.user);
  if (!access.canPost) {
    throw ApiError.forbidden('Vous n\'avez pas le droit de publier dans ce fil de discussion');
  }
  const message = await Message.create({ thread: thread._id, author: req.user._id, content: req.body?.content });
  await message.populate(AUTHOR_POPULATE);
  res.status(201).json({ data: message });
}

// GET /messages/:id
export async function getMessage(req, res) {
  const { message } = await loadMessage(req.params.id, req.user);
  await message.populate(AUTHOR_POPULATE);
  res.json({ data: message });
}

// PUT /messages/:id : seul l'auteur modifie son message.
export async function updateMessage(req, res) {
  const { message } = await loadMessage(req.params.id, req.user);
  if (!sameId(message.author, req.user._id)) throw ApiError.forbidden('Seul l\'auteur peut modifier ce message');
  if (req.body?.content !== undefined) message.content = req.body.content;
  await message.save();
  await message.populate(AUTHOR_POPULATE);
  res.json({ data: message });
}

// DELETE /messages/:id : par l'auteur, un administrateur du groupe ou un organisateur de l'événement.
export async function deleteMessage(req, res) {
  const { message, access } = await loadMessage(req.params.id, req.user);
  if (!sameId(message.author, req.user._id) && !access.canManage) {
    throw ApiError.forbidden('Seuls l\'auteur ou un responsable peuvent supprimer ce message');
  }
  await deleteMessages({ _id: message._id });
  res.status(204).end();
}
