import { Router } from 'express';
import { validateIdParam } from '../middlewares/security.js';

// Crée un routeur qui vérifie automatiquement le format des identifiants présents dans l'URL.
export function createRouter() {
  const router = Router();
  for (const name of ['id', 'eventId', 'userId']) router.param(name, validateIdParam);
  return router;
}
