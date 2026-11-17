import rateLimit from 'express-rate-limit';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { isObjectId } from '../utils/helpers.js';

// Protection contre les injections NoSQL : on refuse toute clé qui ressemble
// à un opérateur MongoDB ("$gt", "$ne"...) ou à un chemin ("a.b").
function hasForbiddenKey(value) {
  if (Array.isArray(value)) return value.some(hasForbiddenKey);
  if (value === null || typeof value !== 'object') return false;
  return Object.entries(value).some(([key, child]) => key.startsWith('$') || key.includes('.') || hasForbiddenKey(child));
}

export function rejectMongoOperators(req, res, next) {
  if (hasForbiddenKey(req.body) || hasForbiddenKey(req.query)) {
    throw ApiError.badRequest('Les noms de champs ne peuvent pas commencer par "$" ni contenir un point');
  }
  next();
}

// Valide les paramètres d'URL qui sont des identifiants MongoDB (:id, :eventId, :userId).
export function validateIdParam(req, res, next, value, name) {
  if (!isObjectId(value)) throw ApiError.badRequest(`Le paramètre ${name} n'est pas un identifiant valide`);
  req.params[name] = value.toLowerCase();
  next();
}

const limiter = (max, message) =>
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res) => res.status(429).json({ error: { status: 429, message } }),
  });

// Limite les essais de connexion et les achats de billets pour freiner les abus.
export const authLimiter = limiter(30, 'Trop de tentatives. Réessayez dans quelques minutes.');
export const purchaseLimiter = limiter(60, 'Trop de demandes de billets. Réessayez dans quelques minutes.');
