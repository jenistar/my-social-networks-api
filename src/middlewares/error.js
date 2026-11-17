import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';

// Messages clairs pour les index uniques. La clé est la liste des champs de l'index.
const DUPLICATE_MESSAGES = {
  email: 'Cet email est déjà utilisé par un autre compte',
  'event+nameKey': 'Cet élément est déjà dans la shopping list de l\'événement',
  'event+buyerKey': 'Cette personne possède déjà un billet pour cet événement',
  'poll+user': 'Vous avez déjà répondu à ce sondage',
  'event+driver': 'Vous proposez déjà un covoiturage pour cet événement',
  'event+name': 'Un type de billet porte déjà ce nom pour cet événement',
};

export function notFound(req, res) {
  res.status(404).json({ error: { status: 404, message: `Route introuvable : ${req.method} ${req.path}` } });
}

// Gestionnaire d'erreurs central : toutes les erreurs de l'API ont le même format JSON.
// Express reconnaît un gestionnaire d'erreurs à ses quatre paramètres : "next" doit rester présent.
export function errorHandler(err, req, res, next) {
  let status = 500;
  let message = 'Erreur interne du serveur';
  let details;

  if (err instanceof ApiError) {
    ({ status, message, details } = err);
  } else if (err instanceof mongoose.Error.ValidationError) {
    status = 400;
    message = 'Données invalides';
    details = Object.fromEntries(
      Object.entries(err.errors).map(([field, error]) => [
        field,
        error instanceof mongoose.Error.CastError ? `Valeur invalide pour le champ ${field}` : error.message,
      ]),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    status = 400;
    message = `Valeur invalide pour le champ ${err.path}`;
  } else if (err?.code === 11000) {
    status = 409;
    message = DUPLICATE_MESSAGES[Object.keys(err.keyPattern || {}).join('+')] || 'Cette ressource existe déjà';
  } else if (err?.type === 'entity.parse.failed') {
    status = 400;
    message = 'Le corps de la requête n\'est pas un JSON valide';
  } else if (err?.type === 'entity.too.large') {
    status = 413;
    message = 'Le corps de la requête est trop volumineux';
  }

  if (status >= 500 && !env.isTest) console.error(err);

  res.status(status).json({ error: { status, message, ...(details ? { details } : {}) } });
}
