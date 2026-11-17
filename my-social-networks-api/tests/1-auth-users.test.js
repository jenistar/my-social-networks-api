import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { anonymous, client, createEvent, createGroup, createUser, startTestDb, stopTestDb } from './helpers.js';

before(startTestDb);
after(stopTestDb);

describe('Authentification', () => {
  it('crée un compte et renvoie un token, sans jamais renvoyer le mot de passe', async () => {
    const res = await anonymous.post('/auth/register', {
      firstName: 'Awa',
      lastName: 'Diallo',
      email: 'Awa.Diallo@Example.com',
      password: 'MotDePasse123',
      city: 'Paris',
    });
    assert.equal(res.status, 201);
    assert.ok(res.body.data.token);
    assert.equal(res.body.data.user.email, 'awa.diallo@example.com');
    assert.equal(res.body.data.user.password, undefined);
  });

  it('règle 2.1 : refuse deux utilisateurs avec le même email, même avec une casse différente', async () => {
    const res = await anonymous.post('/auth/register', {
      firstName: 'Autre',
      lastName: 'Personne',
      email: 'AWA.DIALLO@example.com',
      password: 'MotDePasse123',
    });
    assert.equal(res.status, 409);
    assert.match(res.body.error.message, /email est déjà utilisé/);
  });

  it('valide les données du compte', async () => {
    const res = await anonymous.post('/auth/register', { firstName: 'A', email: 'pas-un-email', password: 'court' });
    assert.equal(res.status, 400);
    assert.deepEqual(Object.keys(res.body.error.details).sort(), ['email', 'lastName', 'password']);
  });

  it('connecte avec le bon mot de passe et refuse le mauvais', async () => {
    const ok = await anonymous.post('/auth/login', { email: 'awa.diallo@example.com', password: 'MotDePasse123' });
    assert.equal(ok.status, 200);
    assert.ok(ok.body.data.token);

    const wrong = await anonymous.post('/auth/login', { email: 'awa.diallo@example.com', password: 'mauvais' });
    assert.equal(wrong.status, 401);
    const unknown = await anonymous.post('/auth/login', { email: 'inconnu@example.com', password: 'MotDePasse123' });
    assert.equal(unknown.status, 401);
    assert.equal(unknown.body.error.message, wrong.body.error.message);
  });

  it('bloque une tentative d\'injection NoSQL à la connexion', async () => {
    const res = await anonymous.post('/auth/login', { email: { $ne: null }, password: { $ne: null } });
    assert.equal(res.status, 400);
  });

  it('exige un token valide sur les routes protégées', async () => {
    assert.equal((await anonymous.get('/users')).status, 401);
    assert.equal((await client('faux.token.jwt').get('/users')).status, 401);
    assert.equal((await client('faux.token.jwt').get('/auth/me')).status, 401);
  });
});

describe('Utilisateurs (CRUDS)', () => {
  let alice;
  let bob;

  before(async () => {
    alice = await createUser('Alice', { city: 'Lyon' });
    bob = await createUser('Bob');
  });

  it('recherche des utilisateurs sans exposer leur email', async () => {
    const res = await alice.api.get('/users?q=ali');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.length, 1);
    assert.equal(res.body.data[0].firstName, 'Alice');
    assert.equal(res.body.data[0].email, undefined);
    assert.equal(res.body.meta.total, 1);
  });

  it('montre le profil public des autres et le profil complet de soi-même', async () => {
    const other = await alice.api.get(`/users/${bob._id}`);
    assert.equal(other.status, 200);
    assert.equal(other.body.data.email, undefined);

    const self = await alice.api.get(`/users/${alice._id}`);
    assert.equal(self.body.data.email, alice.email);
    assert.equal((await alice.api.get('/auth/me')).body.data._id, alice._id);
  });

  it('renvoie 400 pour un identifiant mal formé et 404 pour un utilisateur inconnu', async () => {
    assert.equal((await alice.api.get('/users/123')).status, 400);
    assert.equal((await alice.api.get('/users/64b000000000000000000000')).status, 404);
  });

  it('ne laisse modifier que son propre compte', async () => {
    assert.equal((await alice.api.put(`/users/${bob._id}`, { firstName: 'Pirate' })).status, 403);

    const res = await alice.api.put(`/users/${alice._id}`, { city: 'Marseille', bio: 'Aime la randonnée' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.city, 'Marseille');
  });

  it('refuse de prendre l\'email d\'un autre utilisateur', async () => {
    const res = await alice.api.put(`/users/${alice._id}`, { email: bob.email });
    assert.equal(res.status, 409);
  });

  it('demande le mot de passe actuel pour en changer', async () => {
    const refused = await alice.api.put(`/users/${alice._id}`, { password: 'NouveauPasse456' });
    assert.equal(refused.status, 400);

    const ok = await alice.api.put(`/users/${alice._id}`, { password: 'NouveauPasse456', currentPassword: 'MotDePasse123' });
    assert.equal(ok.status, 200);
    assert.equal((await anonymous.post('/auth/login', { email: alice.email, password: 'MotDePasse123' })).status, 401);

    // Les tokens émis avant le changement ne sont plus acceptés : il faut se reconnecter.
    assert.equal((await alice.api.get('/auth/me')).status, 401);
    const login = await anonymous.post('/auth/login', { email: alice.email, password: 'NouveauPasse456' });
    assert.equal(login.status, 200);
    assert.equal(login.body.data.user.tokenVersion, undefined);
    alice.api = client(login.body.data.token);
    assert.equal((await alice.api.get('/auth/me')).status, 200);
  });

  it('liste les événements et les groupes visibles d\'un utilisateur', async () => {
    await createEvent(alice, { name: 'Public', visibility: 'public' });
    await createEvent(alice, { name: 'Privé', visibility: 'private' });
    await createGroup(alice, { name: 'Groupe public', type: 'public' });
    await createGroup(alice, { name: 'Groupe secret', type: 'secret' });

    const events = await bob.api.get(`/users/${alice._id}/events`);
    assert.deepEqual(events.body.data.map((event) => event.name), ['Public']);
    assert.equal(events.body.data[0].role, 'organizer');

    const groups = await bob.api.get(`/users/${alice._id}/groups`);
    assert.deepEqual(groups.body.data.map((group) => group.name), ['Groupe public']);
    assert.equal((await alice.api.get(`/users/${alice._id}/groups`)).body.data.length, 2);
  });

  it('refuse de supprimer le compte du seul organisateur d\'un événement', async () => {
    const res = await alice.api.delete(`/users/${alice._id}`);
    assert.equal(res.status, 409);
  });

  it('supprime son compte, le retire des événements et invalide son token', async () => {
    const event = await createEvent(alice, { participants: [bob._id] });
    assert.equal((await alice.api.delete(`/users/${bob._id}`)).status, 403);
    assert.equal((await bob.api.delete(`/users/${bob._id}`)).status, 204);

    assert.equal((await bob.api.get('/auth/me')).status, 401);
    const after = await alice.api.get(`/events/${event._id}`);
    assert.equal(after.body.data.participants.length, 0);
  });
});
