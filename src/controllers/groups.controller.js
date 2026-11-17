import { Event, Group, Thread, USER_PUBLIC_FIELDS } from '../models/index.js';
import {
  assertCanSeeGroupContent,
  assertGroupAdmin,
  assertUsersExist,
  canSeeGroupContent,
  eventRole,
  groupRole,
  loadGroup,
} from '../services/access.js';
import { deleteGroup as deleteGroupCascade } from '../services/cascade.js';
import { ApiError } from '../utils/ApiError.js';
import {
  includesId,
  paginate,
  parsePagination,
  pick,
  sameId,
  searchFilter,
  toIdList,
  unionIds,
  userIdsFromBody,
} from '../utils/helpers.js';

// Paramètres d'un groupe (cahier des charges 1.2).
const GROUP_FIELDS = [
  'name',
  'description',
  'icon',
  'coverPhoto',
  'type',
  'allowMembersToPost',
  'allowMembersToCreateEvents',
];

const GROUP_POPULATE = [
  { path: 'admins', select: USER_PUBLIC_FIELDS },
  { path: 'members', select: USER_PUBLIC_FIELDS },
];

// Prépare un groupe pour la réponse. La liste des membres d'un groupe privé
// n'est pas montrée aux personnes qui n'en font pas partie.
function presentGroup(group, user, { withLists = true } = {}) {
  const { members, admins, ...rest } = typeof group.toObject === 'function' ? group.toObject() : group;
  const result = { ...rest, membersCount: members.length, adminsCount: admins.length, myRole: groupRole({ members, admins }, user) };
  if (withLists && canSeeGroupContent({ type: rest.type, members, admins }, user)) {
    result.admins = admins;
    result.members = members;
  }
  return result;
}

async function sendGroup(res, group, user, status = 200) {
  await group.populate(GROUP_POPULATE);
  res.status(status).json({ data: presentGroup(group, user) });
}

// Les listes de membres et d'administrateurs sont modifiées par des opérations atomiques
// ($addToSet, $pull). Deux requêtes simultanées ne peuvent donc pas s'écraser l'une l'autre.
const updateMembers = (groupId, update, conditions = {}) =>
  Group.findOneAndUpdate({ _id: groupId, ...conditions }, update, { returnDocument: 'after' });

// POST /groups : crée un groupe. Le créateur devient administrateur et membre.
// Un fil de discussion est créé automatiquement pour le groupe.
export async function createGroup(req, res) {
  const admins = unionIds([req.user._id], toIdList(req.body?.admins, 'admins'));
  const members = unionIds(admins, toIdList(req.body?.members, 'members'));
  await assertUsersExist(members);

  const group = await Group.create({ ...pick(req.body, GROUP_FIELDS), admins, members, createdBy: req.user._id });
  await Thread.create({ title: 'Discussion générale', group: group._id, createdBy: req.user._id });
  await sendGroup(res, group, req.user, 201);
}

// GET /groups : recherche de groupes. Les groupes secrets ne sont visibles que par leurs membres.
export async function listGroups(req, res) {
  const me = req.user._id;
  const { q, type, mine } = req.query;
  const and = [{ $or: [{ type: { $in: ['public', 'private'] } }, { members: me }] }];

  const search = searchFilter(q, ['name', 'description']);
  if (search) and.push(search);
  if (['public', 'private', 'secret'].includes(type)) and.push({ type });
  if (mine === 'true') and.push({ members: me });

  const result = await paginate(Group, { $and: and }, parsePagination(req.query), { sort: { name: 1 } });
  result.data = result.data.map((group) => presentGroup(group, req.user, { withLists: false }));
  res.json(result);
}

// GET /groups/:id : détail d'un groupe.
export async function getGroup(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  await sendGroup(res, group, req.user);
}

// PUT /groups/:id : modification des paramètres par un administrateur.
export async function updateGroup(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertGroupAdmin(group, req.user);
  group.set(pick(req.body, GROUP_FIELDS));
  await group.save();
  await sendGroup(res, group, req.user);
}

// DELETE /groups/:id : suppression par un administrateur, avec les fils de discussion du groupe.
export async function deleteGroup(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertGroupAdmin(group, req.user);
  await deleteGroupCascade(group._id);
  res.status(204).end();
}

// GET /groups/:id/members : administrateurs et membres du groupe.
export async function listMembers(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertCanSeeGroupContent(group, req.user);
  await group.populate(GROUP_POPULATE);
  res.json({
    data: { admins: group.admins, members: group.members },
    meta: { adminsCount: group.admins.length, membersCount: group.members.length },
  });
}

// POST /groups/:id/members : un administrateur ajoute un ou plusieurs membres.
export async function addMembers(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertGroupAdmin(group, req.user);
  const userIds = userIdsFromBody(req.body);
  await assertUsersExist(userIds);

  const updated = await updateMembers(group._id, { $addToSet: { members: { $each: userIds } } });
  await sendGroup(res, updated, req.user);
}

// POST /groups/:id/join : rejoindre soi-même un groupe public.
export async function joinGroup(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  if (group.type !== 'public') {
    throw ApiError.forbidden('Ce groupe n\'est pas public. Un administrateur doit vous ajouter.');
  }
  const updated = await updateMembers(group._id, { $addToSet: { members: req.user._id } });
  await sendGroup(res, updated, req.user);
}

// DELETE /groups/:id/members/:userId : un administrateur retire un membre, ou un membre quitte le groupe.
export async function removeMember(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  const { userId } = req.params;
  if (!sameId(userId, req.user._id)) assertGroupAdmin(group, req.user);

  if (!includesId(group.members, userId)) throw ApiError.notFound('Cet utilisateur n\'est pas membre du groupe');

  // Si la personne est administratrice, on vérifie dans la même opération qu'il en restera au moins un.
  const conditions = includesId(group.admins, userId) ? { 'admins.1': { $exists: true } } : {};
  const updated = await updateMembers(group._id, { $pull: { admins: userId, members: userId } }, conditions);
  if (!updated) {
    throw ApiError.conflict('Un groupe doit garder au moins un administrateur. Nommez un autre administrateur avant.');
  }
  res.status(204).end();
}

// POST /groups/:id/admins : un administrateur nomme un autre administrateur.
export async function addAdmins(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertGroupAdmin(group, req.user);
  const userIds = userIdsFromBody(req.body);
  await assertUsersExist(userIds);

  const updated = await updateMembers(group._id, {
    $addToSet: { admins: { $each: userIds }, members: { $each: userIds } },
  });
  await sendGroup(res, updated, req.user);
}

// DELETE /groups/:id/admins/:userId : retire le rôle d'administrateur (la personne reste membre).
export async function removeAdmin(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertGroupAdmin(group, req.user);
  const { userId } = req.params;

  if (!includesId(group.admins, userId)) throw ApiError.notFound('Cet utilisateur n\'est pas administrateur du groupe');

  const updated = await updateMembers(group._id, { $pull: { admins: userId } }, { admins: userId, 'admins.1': { $exists: true } });
  if (!updated) throw ApiError.conflict('Un groupe doit garder au moins un administrateur');
  await sendGroup(res, updated, req.user);
}

// GET /groups/:id/events : événements créés dans le groupe et visibles par le demandeur.
export async function listGroupEvents(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertCanSeeGroupContent(group, req.user);

  const me = req.user._id;
  const filter = { group: group._id, $or: [{ visibility: 'public' }, { organizers: me }, { participants: me }] };
  const result = await paginate(Event, filter, parsePagination(req.query), { sort: { startDate: 1 } });
  result.data = result.data.map(({ participants, ...event }) => ({
    ...event,
    participantsCount: participants.length,
    myRole: eventRole({ organizers: event.organizers, participants }, req.user),
  }));
  res.json(result);
}

// GET /groups/:id/threads : fils de discussion du groupe.
export async function listGroupThreads(req, res) {
  const group = await loadGroup(req.params.id, req.user);
  assertCanSeeGroupContent(group, req.user);
  const result = await paginate(Thread, { group: group._id }, parsePagination(req.query), { sort: { createdAt: 1 } });
  res.json(result);
}
