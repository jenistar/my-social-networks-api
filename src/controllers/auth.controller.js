import bcrypt from 'bcryptjs';
import { signToken } from '../middlewares/auth.js';
import { User } from '../models/index.js';
import { ApiError } from '../utils/ApiError.js';
import { pick } from '../utils/helpers.js';

export const USER_EDITABLE_FIELDS = ['firstName', 'lastName', 'email', 'birthDate', 'phone', 'city', 'bio', 'avatar'];

// Hash factice : on compare toujours un mot de passe, même si l'email est inconnu.
// Le temps de réponse ne révèle donc pas si un compte existe.
const DUMMY_HASH = bcrypt.hashSync('mot-de-passe-factice', 4);

// POST /auth/register : crée un compte (le "C" du CRUDS utilisateurs).
export async function register(req, res) {
  const user = await User.create(pick(req.body, [...USER_EDITABLE_FIELDS, 'password']));
  res.status(201).json({ data: { user, token: signToken(user) } });
}

// POST /auth/login : renvoie un token JWT à envoyer ensuite dans l'en-tête Authorization.
export async function login(req, res) {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    throw ApiError.badRequest('L\'email et le mot de passe sont obligatoires');
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');
  const passwordOk = await bcrypt.compare(password, user ? user.password : DUMMY_HASH);
  if (!user || !passwordOk) throw ApiError.unauthorized('Email ou mot de passe incorrect');

  res.json({ data: { user, token: signToken(user) } });
}

// GET /auth/me : profil complet de l'utilisateur connecté.
export async function me(req, res) {
  res.json({ data: req.user });
}
