import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user._id), v: user.tokenVersion }, env.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: env.jwtExpiresIn,
  });
}

// Vérifie le token JWT envoyé dans l'en-tête "Authorization: Bearer <token>".
// L'utilisateur connecté est ensuite disponible dans req.user.
export async function authenticate(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('Token manquant. Ajoutez l\'en-tête Authorization: Bearer <token>');
  }

  let payload;
  try {
    payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    throw ApiError.unauthorized('Token invalide ou expiré');
  }

  const user = await User.findById(payload.sub);
  if (!user) throw ApiError.unauthorized('Ce compte n\'existe plus');
  // Un token émis avant un changement de mot de passe n'est plus accepté.
  if (payload.v !== user.tokenVersion) throw ApiError.unauthorized('Token invalide ou expiré');

  req.user = user;
  next();
}
