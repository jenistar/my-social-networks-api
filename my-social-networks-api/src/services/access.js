// Règles d'accès de l'API. Toutes les vérifications de droits passent par ce fichier.
import { Event, Group, Thread, User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { includesId } from '../utils/helpers.js';

// ---------- Événements ----------

// Un organisateur a aussi tous les droits d'un participant.
export function eventRole(event, user) {
  if (includesId(event.organizers, user._id)) return 'organizer';
  if (includesId(event.participants, user._id)) return 'participant';
  return 'none';
}

export const isOrganizer = (event, user) => eventRole(event, user) === 'organizer';
export const isEventMember = (event, user) => eventRole(event, user) !== 'none';

// Un événement public est visible par tous. Un événement privé est réservé aux personnes invitées.
export const canViewEvent = (event, user) => event.visibility === 'public' || isEventMember(event, user);

export async function loadEvent(id) {
  const event = await Event.findById(id);
  if (!event) throw ApiError.notFound('Événement introuvable');
  return event;
}

export function assertCanViewEvent(event, user) {
  if (!canViewEvent(event, user)) {
    throw ApiError.forbidden('Cet événement est privé. Seules les personnes invitées y ont accès.');
  }
}

export function assertEventMember(event, user) {
  if (!isEventMember(event, user)) {
    throw ApiError.forbidden('Action réservée aux participants et aux organisateurs de l\'événement');
  }
}

export function assertOrganizer(event, user) {
  if (!isOrganizer(event, user)) {
    throw ApiError.forbidden('Action réservée aux organisateurs de l\'événement');
  }
}

// ---------- Groupes ----------

export function groupRole(group, user) {
  if (includesId(group.admins, user._id)) return 'admin';
  if (includesId(group.members, user._id)) return 'member';
  return 'none';
}

export const isGroupAdmin = (group, user) => groupRole(group, user) === 'admin';
export const isGroupMember = (group, user) => groupRole(group, user) !== 'none';

// Public et privé : le groupe est trouvable par tous. Secret : seuls les membres le voient.
export const canSeeGroup = (group, user) => group.type !== 'secret' || isGroupMember(group, user);
// Public : le contenu est visible par tous. Privé et secret : réservé aux membres.
export const canSeeGroupContent = (group, user) => group.type === 'public' || isGroupMember(group, user);

// Pour un groupe secret, on répond 404 aux non-membres afin de ne pas révéler son existence.
export async function loadGroup(id, user) {
  const group = await Group.findById(id);
  if (!group || !canSeeGroup(group, user)) throw ApiError.notFound('Groupe introuvable');
  return group;
}

export function assertCanSeeGroupContent(group, user) {
  if (!canSeeGroupContent(group, user)) {
    throw ApiError.forbidden('Le contenu de ce groupe est réservé à ses membres');
  }
}

export function assertGroupAdmin(group, user) {
  if (!isGroupAdmin(group, user)) {
    throw ApiError.forbidden('Action réservée aux administrateurs du groupe');
  }
}

// ---------- Fils de discussion ----------

// Calcule les droits d'un utilisateur sur un fil, selon qu'il est lié à un groupe ou à un événement.
export async function threadAccess(thread, user) {
  if (!thread) throw ApiError.notFound('Fil de discussion introuvable');
  if (thread.group) {
    const group = await Group.findById(thread.group);
    if (!group || !canSeeGroup(group, user)) throw ApiError.notFound('Fil de discussion introuvable');
    const role = groupRole(group, user);
    return {
      canRead: canSeeGroupContent(group, user),
      // Le groupe choisit si ses membres peuvent publier. Les administrateurs le peuvent toujours.
      canPost: role === 'admin' || (role === 'member' && group.allowMembersToPost),
      canComment: role !== 'none',
      canManage: role === 'admin',
    };
  }

  const event = await Event.findById(thread.event);
  if (!event) throw ApiError.notFound('Fil de discussion introuvable');
  const role = eventRole(event, user);
  return {
    canRead: canViewEvent(event, user),
    canPost: role !== 'none',
    canComment: role !== 'none',
    canManage: role === 'organizer',
  };
}

export async function loadThread(id, user) {
  const thread = await Thread.findById(id);
  if (!thread) throw ApiError.notFound('Fil de discussion introuvable');
  const access = await threadAccess(thread, user);
  if (!access.canRead) throw ApiError.forbidden('Vous n\'avez pas accès à ce fil de discussion');
  return { thread, access };
}

// ---------- Utilisateurs ----------

export async function assertUsersExist(ids) {
  if (ids.length === 0) return;
  const count = await User.countDocuments({ _id: { $in: ids } });
  if (count !== ids.length) throw ApiError.notFound('Un des utilisateurs indiqués n\'existe pas');
}
