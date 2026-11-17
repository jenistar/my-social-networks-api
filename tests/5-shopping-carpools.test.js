import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { anonymous, createEvent, createUser, dates, startTestDb, stopTestDb } from './helpers.js';

let alice;
let bob;
let chloe;
let dan;

before(async () => {
  await startTestDb();
  [alice, bob, chloe, dan] = await Promise.all(['Alice', 'Bob', 'Chloe', 'Dan'].map((name) => createUser(name)));
});
after(stopTestDb);

describe('Shopping list (CRUDS)', () => {
  let event;
  let item;
  const arrival = dates.inDays(10, 1);

  before(async () => {
    event = await createEvent(alice, { visibility: 'public', participants: [bob._id, chloe._id] });
  });

  it('règle 2.8 : n\'est utilisable que si la shopping list est activée', async () => {
    const url = `/events/${event._id}/shopping-items`;
    const disabled = await bob.api.post(url, { name: 'Chips', quantity: 3, arrivalTime: arrival });
    assert.equal(disabled.status, 409);
    assert.match(disabled.body.error.message, /pas activée/);
    assert.equal((await bob.api.get(url)).status, 409);

    const enabled = await alice.api.put(`/events/${event._id}`, { shoppingListEnabled: true });
    assert.equal(enabled.body.data.shoppingListEnabled, true);
  });

  it('règle 2.8 : un utilisateur indique un nom, une quantité et une heure d\'arrivée', async () => {
    const url = `/events/${event._id}/shopping-items`;
    const res = await bob.api.post(url, { name: 'Chips', quantity: 3, arrivalTime: arrival });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.name, 'Chips');
    assert.equal(res.body.data.quantity, 3);
    assert.equal(res.body.data.arrivalTime, arrival);
    assert.equal(res.body.data.user.firstName, 'Bob');
    assert.equal(res.body.data.nameKey, undefined);
    item = res.body.data;

    const invalid = await bob.api.post(url, { quantity: 1.5 });
    assert.equal(invalid.status, 400);
    assert.deepEqual(Object.keys(invalid.body.error.details).sort(), ['arrivalTime', 'name', 'quantity']);
    assert.equal((await bob.api.post(url, { name: 'Glaçons', quantity: 0, arrivalTime: arrival })).status, 400);
    assert.equal((await bob.api.post(url, { name: 'Glaçons', quantity: 1, arrivalTime: dates.inDays(20) })).status, 400);
  });

  it('règle 2.8 : chaque chose apportée est unique par événement', async () => {
    const url = `/events/${event._id}/shopping-items`;
    for (const name of ['Chips', 'chips', '  CHIPS  ']) {
      const res = await chloe.api.post(url, { name, quantity: 1, arrivalTime: arrival });
      assert.equal(res.status, 409, name);
      assert.match(res.body.error.message, /déjà dans la shopping list/);
    }
    assert.equal((await chloe.api.post(url, { name: 'Pâté', quantity: 1, arrivalTime: arrival })).status, 201);
    assert.equal((await alice.api.post(url, { name: 'pate', quantity: 1, arrivalTime: arrival })).status, 409);

    // Le même nom reste possible dans un autre événement.
    const other = await createEvent(alice, { shoppingListEnabled: true });
    const res = await alice.api.post(`/events/${other._id}/shopping-items`, { name: 'Chips', quantity: 1, arrivalTime: arrival });
    assert.equal(res.status, 201);
  });

  it('réserve la shopping list aux participants de l\'événement', async () => {
    const url = `/events/${event._id}/shopping-items`;
    assert.equal((await dan.api.get(url)).status, 403);
    assert.equal((await dan.api.post(url, { name: 'Soda', quantity: 2, arrivalTime: arrival })).status, 403);
    assert.equal((await dan.api.get(`/shopping-items/${item._id}`)).status, 403);
    assert.equal((await anonymous.get(url)).status, 401);
  });

  it('liste et recherche les éléments de la shopping list', async () => {
    const url = `/events/${event._id}/shopping-items`;
    const all = await chloe.api.get(url);
    assert.deepEqual(all.body.data.map((entry) => entry.name).sort(), ['Chips', 'Pâté']);
    assert.equal(all.body.data[0].nameKey, undefined);
    assert.equal((await chloe.api.get(`${url}?q=chi`)).body.data.length, 1);
    assert.equal((await chloe.api.get(`/shopping-items/${item._id}`)).body.data.user.firstName, 'Bob');
  });

  it('laisse modifier son élément, sans créer de doublon', async () => {
    assert.equal((await chloe.api.put(`/shopping-items/${item._id}`, { quantity: 10 })).status, 403);

    const updated = await bob.api.put(`/shopping-items/${item._id}`, { name: 'Chips au paprika', quantity: 5 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Chips au paprika');
    assert.equal(updated.body.data.quantity, 5);

    assert.equal((await bob.api.put(`/shopping-items/${item._id}`, { name: 'PATE' })).status, 409);
    // L'ancien nom est de nouveau disponible.
    assert.equal(
      (await chloe.api.post(`/events/${event._id}/shopping-items`, { name: 'Chips', quantity: 1, arrivalTime: arrival })).status,
      201,
    );
  });

  it('laisse retirer un élément à son auteur ou à un organisateur', async () => {
    assert.equal((await chloe.api.delete(`/shopping-items/${item._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/shopping-items/${item._id}`)).status, 204);
    assert.equal((await bob.api.get(`/shopping-items/${item._id}`)).status, 404);
  });
});

describe('Covoiturage (CRUDS, bonus)', () => {
  let event;
  let carpool;
  const offer = (overrides = {}) => ({
    departureLocation: 'Gare de Cergy-Préfecture',
    departureTime: dates.inDays(9, 20),
    price: 8.5,
    availableSeats: 3,
    maxDetourMinutes: 30,
    ...overrides,
  });

  before(async () => {
    event = await createEvent(alice, { visibility: 'public', participants: [bob._id, chloe._id] });
  });

  it('n\'est utilisable que si le covoiturage est activé', async () => {
    const url = `/events/${event._id}/carpools`;
    const disabled = await bob.api.post(url, offer());
    assert.equal(disabled.status, 409);
    assert.match(disabled.body.error.message, /pas activé/);

    await alice.api.put(`/events/${event._id}`, { carpoolingEnabled: true });
    assert.equal((await bob.api.get(url)).status, 200);
  });

  it('enregistre le lieu, l\'heure, le prix, les places et le temps maximum d\'écart', async () => {
    const res = await bob.api.post(`/events/${event._id}/carpools`, offer());
    assert.equal(res.status, 201);
    carpool = res.body.data;
    assert.equal(carpool.departureLocation, 'Gare de Cergy-Préfecture');
    assert.equal(carpool.price, 8.5);
    assert.equal(carpool.availableSeats, 3);
    assert.equal(carpool.maxDetourMinutes, 30);
    assert.equal(carpool.driver.firstName, 'Bob');
  });

  it('valide les données du covoiturage', async () => {
    const url = `/events/${event._id}/carpools`;
    const empty = await chloe.api.post(url, {});
    assert.equal(empty.status, 400);
    assert.deepEqual(Object.keys(empty.body.error.details).sort(), [
      'availableSeats',
      'departureLocation',
      'departureTime',
      'maxDetourMinutes',
      'price',
    ]);
    assert.equal((await chloe.api.post(url, offer({ price: -1 }))).status, 400);
    assert.equal((await chloe.api.post(url, offer({ availableSeats: 0 }))).status, 400);
    assert.equal((await chloe.api.post(url, offer({ maxDetourMinutes: -10 }))).status, 400);
    assert.equal((await chloe.api.post(url, offer({ departureTime: dates.inDays(30) }))).status, 400);
  });

  it('limite chaque utilisateur à un covoiturage par événement, réservé aux participants', async () => {
    const url = `/events/${event._id}/carpools`;
    assert.equal((await bob.api.post(url, offer())).status, 409);
    assert.equal((await dan.api.post(url, offer())).status, 403);
    assert.equal((await dan.api.get(url)).status, 403);
  });

  it('liste et recherche les covoiturages', async () => {
    const url = `/events/${event._id}/carpools`;
    await chloe.api.post(url, offer({ departureLocation: 'Pontoise centre', price: 4, departureTime: dates.inDays(9, 18) }));

    const all = await alice.api.get(url);
    assert.deepEqual(all.body.data.map((entry) => entry.driver.firstName), ['Chloe', 'Bob'], 'triés par heure de départ');
    assert.equal((await alice.api.get(`${url}?q=cergy`)).body.data.length, 1);
    assert.equal((await alice.api.get(`${url}?maxPrice=5`)).body.data.length, 1);
    assert.equal((await alice.api.get(`/carpools/${carpool._id}`)).body.data.price, 8.5);
  });

  it('laisse le conducteur modifier, et le conducteur ou un organisateur supprimer', async () => {
    assert.equal((await chloe.api.put(`/carpools/${carpool._id}`, { price: 0 })).status, 403);
    const updated = await bob.api.put(`/carpools/${carpool._id}`, { availableSeats: 2, price: 7 });
    assert.equal(updated.body.data.availableSeats, 2);
    assert.equal(updated.body.data.price, 7);
    assert.equal((await bob.api.put(`/carpools/${carpool._id}`, { availableSeats: 20 })).status, 400);

    assert.equal((await chloe.api.delete(`/carpools/${carpool._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/carpools/${carpool._id}`)).status, 204);
    assert.equal((await bob.api.get(`/carpools/${carpool._id}`)).status, 404);
  });
});

describe('Format des erreurs et routes générales', () => {
  it('répond sur les routes publiques d\'information', async () => {
    const info = await anonymous.get('/');
    assert.equal(info.body.data.version, '2.0.0');
    const health = await anonymous.get('/health');
    assert.deepEqual([health.status, health.body.data.database], [200, 'connected']);
  });

  it('renvoie toujours les erreurs au même format JSON', async () => {
    const res = await alice.api.get('/route-inconnue');
    assert.equal(res.status, 404);
    assert.deepEqual(Object.keys(res.body.error), ['status', 'message']);

    const malformed = await anonymous.post('/auth/login').set('Content-Type', 'application/json').send('{"email": ');
    assert.equal(malformed.status, 400);
    assert.match(malformed.body.error.message, /JSON valide/);

    const operators = await alice.api.post('/events', { name: { $gt: '' } });
    assert.equal(operators.status, 400);
  });
});
