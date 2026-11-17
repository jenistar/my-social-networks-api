import { ApiError } from './ApiError.js';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

export const isObjectId = (value) => typeof value === 'string' && OBJECT_ID_PATTERN.test(value);

// Vérifie qu'une valeur est un identifiant MongoDB valide, sinon renvoie une erreur 400.
export function assertObjectId(value, label = 'Identifiant') {
  if (!isObjectId(value)) throw ApiError.badRequest(`${label} invalide`);
  return value.toLowerCase();
}

// Transforme un champ du corps de la requête en liste d'identifiants uniques et valides.
export function toIdList(value, field) {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw ApiError.badRequest(`Le champ ${field} doit être une liste d'identifiants`);
  if (value.some((id) => !isObjectId(id))) throw ApiError.badRequest(`Le champ ${field} contient un identifiant invalide`);
  return [...new Set(value.map((id) => id.toLowerCase()))];
}

// Accepte { userId: "..." } ou { userIds: ["...", "..."] }.
export function userIdsFromBody(body) {
  const ids = toIdList(body?.userIds, 'userIds');
  if (body?.userId !== undefined) ids.push(assertObjectId(body.userId, 'userId'));
  if (ids.length === 0) throw ApiError.badRequest('Indiquez userId ou userIds');
  return [...new Set(ids)];
}

const idOf = (value) => String(value?._id ?? value);

export const sameId = (a, b) => idOf(a) === idOf(b);
export const includesId = (list, id) => list.some((item) => sameId(item, id));
export const unionIds = (...lists) => [...new Set(lists.flat().map(idOf))];

// Ne garde que les champs autorisés. Cela évite qu'un client modifie des champs internes.
export function pick(source, fields) {
  const result = {};
  for (const field of fields) {
    if (source?.[field] !== undefined) result[field] = source[field];
  }
  return result;
}

export function parsePagination(query) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

export function parseDate(value, label) {
  if (value === undefined) return null;
  const date = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(date.getTime())) {
    throw ApiError.badRequest(`${label} doit être une date valide au format ISO 8601`);
  }
  return date;
}

export const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Construit un filtre de recherche insensible à la casse sur plusieurs champs.
export function searchFilter(q, fields) {
  if (typeof q !== 'string' || !q.trim()) return null;
  const regex = new RegExp(escapeRegex(q.trim().slice(0, 100)), 'i');
  return { $or: fields.map((field) => ({ [field]: regex })) };
}

// Exécute une recherche paginée et renvoie le format commun { data, meta }.
export async function paginate(Model, filter, { page, limit, skip }, { sort = { createdAt: -1 }, populate, select } = {}) {
  let query = Model.find(filter).sort(sort).skip(skip).limit(limit);
  if (select) query = query.select(select);
  if (populate) query = query.populate(populate);
  const [data, total] = await Promise.all([query.lean(), Model.countDocuments(filter)]);
  return { data, meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}

// Clé de comparaison : sans accents, sans majuscules, sans espaces en trop.
// Elle sert aux règles d'unicité (shopping list, un seul billet par personne).
export function normalizeKey(...parts) {
  return parts
    .map((part) =>
      String(part ?? '')
        .normalize('NFD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .join('|');
}

export const httpUrlValidator = {
  validator: (value) => value === null || value === '' || /^https?:\/\/\S+$/i.test(value),
  message: 'Le champ {PATH} doit être une URL commençant par http:// ou https://',
};
