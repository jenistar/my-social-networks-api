import { Comment, Message, Photo, Thread, USER_PUBLIC_FIELDS } from '../models/index.js';
import { canViewEvent, eventRole, loadEvent, threadAccess } from '../services/access.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate, parsePagination, sameId } from '../utils/helpers.js';

const AUTHOR_POPULATE = { path: 'author', select: USER_PUBLIC_FIELDS };

// Calcule les droits du demandeur sur les commentaires d'un message ou d'une photo.
async function targetAccess(targetType, targetId, user) {
  if (targetType === 'Message') {
    const message = await Message.findById(targetId);
    if (!message) throw ApiError.notFound('Message introuvable');
    return threadAccess(await Thread.findById(message.thread), user);
  }

  const photo = await Photo.findById(targetId);
  if (!photo) throw ApiError.notFound('Photo introuvable');
  const event = await loadEvent(photo.event);
  const role = eventRole(event, user);
  return { canRead: canViewEvent(event, user), canComment: role !== 'none', canManage: role === 'organizer' };
}

async function loadComment(id, user) {
  const comment = await Comment.findById(id);
  if (!comment) throw ApiError.notFound('Commentaire introuvable');
  const access = await targetAccess(comment.targetType, comment.target, user);
  if (!access.canRead) throw ApiError.forbidden('Vous n\'avez pas accès à ce commentaire');
  return { comment, access };
}

// GET /messages/:id/comments et GET /photos/:id/comments
export const listComments = (targetType) => async (req, res) => {
  const access = await targetAccess(targetType, req.params.id, req.user);
  if (!access.canRead) throw ApiError.forbidden('Vous n\'avez pas accès à ces commentaires');

  const filter = { targetType, target: req.params.id };
  const result = await paginate(Comment, filter, parsePagination(req.query), {
    sort: { createdAt: 1 },
    populate: AUTHOR_POPULATE,
  });
  res.json(result);
};

// POST /messages/:id/comments et POST /photos/:id/comments
// Règles 2.4 et 2.5 : chaque membre ou participant peut commenter.
export const createComment = (targetType) => async (req, res) => {
  const access = await targetAccess(targetType, req.params.id, req.user);
  if (!access.canComment) {
    throw ApiError.forbidden(
      targetType === 'Message'
        ? 'Seuls les membres du groupe ou les participants de l\'événement peuvent commenter ce message'
        : 'Seuls les participants de l\'événement peuvent commenter cette photo',
    );
  }

  const comment = await Comment.create({
    targetType,
    target: req.params.id,
    author: req.user._id,
    content: req.body?.content,
  });
  await comment.populate(AUTHOR_POPULATE);
  res.status(201).json({ data: comment });
};

// GET /comments/:id
export async function getComment(req, res) {
  const { comment } = await loadComment(req.params.id, req.user);
  await comment.populate(AUTHOR_POPULATE);
  res.json({ data: comment });
}

// PUT /comments/:id : seul l'auteur modifie son commentaire.
export async function updateComment(req, res) {
  const { comment } = await loadComment(req.params.id, req.user);
  if (!sameId(comment.author, req.user._id)) throw ApiError.forbidden('Seul l\'auteur peut modifier ce commentaire');
  if (req.body?.content !== undefined) comment.content = req.body.content;
  await comment.save();
  await comment.populate(AUTHOR_POPULATE);
  res.json({ data: comment });
}

// DELETE /comments/:id : par l'auteur, un administrateur du groupe ou un organisateur de l'événement.
export async function deleteComment(req, res) {
  const { comment, access } = await loadComment(req.params.id, req.user);
  if (!sameId(comment.author, req.user._id) && !access.canManage) {
    throw ApiError.forbidden('Seuls l\'auteur ou un responsable peuvent supprimer ce commentaire');
  }
  await comment.deleteOne();
  res.status(204).end();
}
