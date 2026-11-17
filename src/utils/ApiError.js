// Erreur métier avec un code HTTP. Elle est transformée en réponse JSON par le gestionnaire d'erreurs.
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }

  static badRequest(message = 'Requête invalide', details) {
    return new ApiError(400, message, details);
  }

  static unauthorized(message = 'Authentification requise') {
    return new ApiError(401, message);
  }

  static forbidden(message = 'Action non autorisée') {
    return new ApiError(403, message);
  }

  static notFound(message = 'Ressource introuvable') {
    return new ApiError(404, message);
  }

  static conflict(message = 'Conflit avec une ressource existante') {
    return new ApiError(409, message);
  }
}
