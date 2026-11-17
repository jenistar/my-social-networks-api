import {
  Carpool,
  Event,
  Group,
  PollResponse,
  ShoppingItem,
  User,
  USER_PUBLIC_FIELDS,
} from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { paginate, parsePagination, pick, sameId, searchFilter } from '../utils/helpers.js';
import { USER_EDITABLE_FIELDS } from './auth.controller.js';

function assertSelf(req) {
  if (!sameId(req.params.id, req.user._id)) {
    throw ApiError.forbidden('Vous ne pouvez modifier ou supprimer que votre propre compte');
  }
}

// GET /users : recherche d'utilisateurs par nom ou prénom. Les emails ne sont jamais exposés.
export async function listUsers(req, res) {
  const filter = searchFilter(req.query.q, ['firstName', 'lastName', 'city']) ?? {};

  const result = await paginate(User, filter, parsePagination(req.query), {
    sort: { lastName: 1, firstName: 1 },
    select: USER_PUBLIC_FIELDS,
  });
  res.json(result);
}

// GET /users/:id : profil public d'un utilisateur (profil complet si c'est le sien).
export async function getUser(req, res) {
  if (sameId(req.params.id, req.user._id)) return res.json({ data: req.user });

  const user = await User.findById(req.params.id).select(USER_PUBLIC_FIELDS).lean();
  if (!user) throw ApiError.notFound('Utilisateur introuvable');
  res.json({ data: user });
}

// PUT /users/:id : un utilisateur ne modifie que son propre compte.
// Après un changement de mot de passe, tous les tokens existants sont invalidés : il faut se reconnecter.
export async function updateUser(req, res) {
  assertSelf(req);
  const user = await User.findById(req.user._id).select('+password');
  user.set(pick(req.body, USER_EDITABLE_FIELDS));

  // Changer de mot de passe demande de connaître l'ancien.
  if (req.body?.password !== undefined) {
    const { currentPassword } = req.body;
    if (typeof currentPassword !== 'string' || !(await user.checkPassword(currentPassword))) {
      throw ApiError.badRequest('Le mot de passe actuel (currentPassword) est incorrect');
    }
    user.password = req.body.password;
  }

  await user.save();
  res.json({ data: user });
}

// DELETE /users/:id : supprime son propre compte et le retire des événements et des groupes.
export async function deleteUser(req, res) {
  assertSelf(req);
  const userId = req.user._id;

  // Les règles "au moins 1 organisateur" et "au moins 1 administrateur" doivent rester vraies.
  const [soleOrganizer, soleAdmin] = await Promise.all([
    Event.exists({ organizers: { $size: 1, $all: [userId] } }),
    Group.exists({ admins: { $size: 1, $all: [userId] } }),
  ]);
  if (soleOrganizer) {
    throw ApiError.conflict('Vous êtes le seul organisateur d\'un événement. Nommez un autre organisateur ou supprimez l\'événement avant de supprimer votre compte.');
  }
  if (soleAdmin) {
    throw ApiError.conflict('Vous êtes le seul administrateur d\'un groupe. Nommez un autre administrateur ou supprimez le groupe avant de supprimer votre compte.');
  }

  await Promise.all([
    Event.updateMany({}, { $pull: { organizers: userId, participants: userId } }),
    Group.updateMany({}, { $pull: { admins: userId, members: userId } }),
    PollResponse.deleteMany({ user: userId }),
    ShoppingItem.deleteMany({ user: userId }),
    Carpool.deleteMany({ driver: userId }),
  ]);
  await User.deleteOne({ _id: userId });
  res.status(204).end();
}

// GET /users/:id/events : événements d'un utilisateur que le demandeur a le droit de voir.
export async function listUserEvents(req, res) {
  const { id } = req.params;
  if (!(await User.exists({ _id: id }))) throw ApiError.notFound('Utilisateur introuvable');

  const me = req.user._id;
  const filter = {
    $and: [
      { $or: [{ organizers: id }, { participants: id }] },
      { $or: [{ visibility: 'public' }, { organizers: me }, { participants: me }] },
    ],
  };
  const result = await paginate(Event, filter, parsePagination(req.query), {
    sort: { startDate: 1 },
    select: 'name startDate endDate location coverPhoto visibility group organizers',
  });
  result.data = result.data.map(({ organizers, ...event }) => ({
    ...event,
    role: organizers.some((organizer) => sameId(organizer, id)) ? 'organizer' : 'participant',
  }));
  res.json(result);
}

// GET /users/:id/groups : groupes d'un utilisateur que le demandeur a le droit de voir.
export async function listUserGroups(req, res) {
  const { id } = req.params;
  if (!(await User.exists({ _id: id }))) throw ApiError.notFound('Utilisateur introuvable');

  // Les groupes publics sont visibles par tous. Pour les autres, il faut en être membre soi-même.
  const filter = { members: id, $or: [{ type: 'public' }, { members: req.user._id }] };
  const result = await paginate(Group, filter, parsePagination(req.query), {
    sort: { name: 1 },
    select: 'name description icon type admins',
  });
  result.data = result.data.map(({ admins, ...group }) => ({
    ...group,
    role: admins.some((admin) => sameId(admin, id)) ? 'admin' : 'member',
  }));
  res.json(result);
}
