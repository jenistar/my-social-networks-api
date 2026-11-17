// Outils communs aux tests d'intégration.
// Les tests utilisent une vraie base MongoDB, séparée de la base de développement.
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { connectDb, disconnectDb } from '../src/config/db.js';

const TEST_URI = process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/my_social_networks_test';

export const app = createApp();

// À appeler dans before() : connexion puis remise à zéro de toutes les collections.
export async function startTestDb() {
  await connectDb(TEST_URI);
  await Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));
}

export async function stopTestDb() {
  await disconnectDb();
}

// Petit client HTTP : client(token).get('/events') appelle GET /api/events avec le token.
export function client(token) {
  const call = (method) => (url, body) => {
    const req = request(app)[method](`/api${url}`);
    if (token) req.set('Authorization', `Bearer ${token}`);
    return body === undefined ? req : req.send(body);
  };
  return { get: call('get'), post: call('post'), put: call('put'), delete: call('delete') };
}

export const anonymous = client(null);

let counter = 0;

// Crée un compte et renvoie l'utilisateur avec son token et un client déjà authentifié.
export async function createUser(firstName = 'User', extra = {}) {
  counter += 1;
  const email = `${firstName.toLowerCase()}.${counter}.${Date.now()}@example.com`;
  const res = await anonymous.post('/auth/register', {
    firstName,
    lastName: 'Test',
    email,
    password: 'MotDePasse123',
    ...extra,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const { user, token } = res.body.data;
  return { ...user, token, api: client(token) };
}

const inDays = (days, hours = 0) => new Date(Date.now() + days * 86_400_000 + hours * 3_600_000).toISOString();

export const dates = { inDays };

// Crée un événement avec des valeurs par défaut valides.
export async function createEvent(owner, overrides = {}) {
  const res = await owner.api.post('/events', {
    name: 'Soirée de lancement',
    description: 'Présentation puis buffet',
    startDate: inDays(10),
    endDate: inDays(10, 5),
    location: '10 rue de la Paix, 75002 Paris',
    visibility: 'public',
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

export async function createGroup(owner, overrides = {}) {
  const res = await owner.api.post('/groups', {
    name: 'Les randonneurs',
    description: 'Sorties du dimanche',
    type: 'public',
    ...overrides,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
}

export const ids = (list) => list.map((item) => item._id ?? item);
