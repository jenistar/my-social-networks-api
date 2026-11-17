import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createEvent, createGroup, createUser, dates, ids, startTestDb, stopTestDb } from './helpers.js';

let alice;
let bob;
let chloe;
let dan;

before(async () => {
  await startTestDb();
  [alice, bob, chloe, dan] = await Promise.all(['Alice', 'Bob', 'Chloe', 'Dan'].map((name) => createUser(name)));
});
after(stopTestDb);

describe('Événements (CRUDS)', () => {
  it('étape 1 : crée un événement avec toutes les informations demandées', async () => {
    const event = await createEvent(alice, {
      name: 'Gala de fin d\'année',
      coverPhoto: 'https://example.com/gala.jpg',
      visibility: 'private',
      organizers: [bob._id],
      participants: [chloe._id],
    });
    assert.equal(event.name, 'Gala de fin d\'année');
    assert.equal(event.visibility, 'private');
    assert.equal(event.coverPhoto, 'https://example.com/gala.jpg');
    assert.deepEqual(ids(event.organizers).sort(), [alice._id, bob._id].sort());
    assert.deepEqual(ids(event.participants), [chloe._id]);
  });

  it('est privé par défaut', async () => {
    const event = await createEvent(alice, { visibility: undefined });
    assert.equal(event.visibility, 'private');
  });

  it('valide les champs obligatoires, les dates, la visibilité et l\'image', async () => {
    const missing = await alice.api.post('/events', { description: 'sans nom' });
    assert.equal(missing.status, 400);
    assert.deepEqual(Object.keys(missing.body.error.details).sort(), ['endDate', 'location', 'name', 'startDate']);

    const base = { name: 'Test', location: 'Paris', startDate: dates.inDays(5), endDate: dates.inDays(6) };
    assert.equal((await alice.api.post('/events', { ...base, endDate: dates.inDays(4) })).status, 400);
    assert.equal((await alice.api.post('/events', { ...base, visibility: 'secret' })).status, 400);
    assert.equal((await alice.api.post('/events', { ...base, coverPhoto: 'javascript:alert(1)' })).status, 400);
    assert.equal((await alice.api.post('/events', { ...base, participants: ['abc'] })).status, 400);
    assert.equal((await alice.api.post('/events', { ...base, participants: ['64b000000000000000000000'] })).status, 404);
  });

  it('réserve un événement privé aux personnes invitées', async () => {
    const event = await createEvent(alice, { name: 'Dîner privé', visibility: 'private', participants: [bob._id] });

    assert.equal((await bob.api.get(`/events/${event._id}`)).status, 200);
    assert.equal((await dan.api.get(`/events/${event._id}`)).status, 403);
    assert.equal((await dan.api.get(`/events/${event._id}/participants`)).status, 403);
    assert.equal((await dan.api.post(`/events/${event._id}/join`)).status, 403);

    const names = (res) => res.body.data.map((item) => item.name);
    assert.ok(names(await bob.api.get('/events?q=dîner')).includes('Dîner privé'));
    assert.ok(!names(await dan.api.get('/events?q=dîner')).includes('Dîner privé'));
  });

  it('rend un événement public visible par tous, avec recherche et filtres', async () => {
    const event = await createEvent(alice, { name: 'Concert en plein air', location: 'Parc de Cergy', visibility: 'public' });

    assert.equal((await dan.api.get(`/events/${event._id}`)).status, 200);
    const search = await dan.api.get('/events?q=concert&visibility=public');
    assert.equal(search.body.data.length, 1);
    assert.equal(search.body.data[0].myRole, 'none');
    assert.equal(search.body.data[0].participants, undefined);
    assert.equal(search.body.data[0].participantsCount, 0);

    assert.equal((await dan.api.get('/events?q=cergy')).body.data.length, 1);
    assert.equal((await dan.api.get(`/events?q=concert&from=${dates.inDays(30)}`)).body.data.length, 0);
    assert.equal((await dan.api.get('/events?mine=true')).body.data.length, 0);
    assert.equal((await dan.api.get('/events?from=pas-une-date')).status, 400);
  });

  it('pagine les résultats', async () => {
    const res = await alice.api.get('/events?limit=2&page=1');
    assert.equal(res.body.data.length, 2);
    assert.equal(res.body.meta.limit, 2);
    assert.ok(res.body.meta.total >= 4);
    assert.equal(res.body.meta.totalPages, Math.ceil(res.body.meta.total / 2));
  });

  it('ne laisse que les organisateurs modifier ou supprimer l\'événement', async () => {
    const event = await createEvent(alice, { participants: [bob._id] });

    assert.equal((await bob.api.put(`/events/${event._id}`, { name: 'Piraté' })).status, 403);
    assert.equal((await bob.api.delete(`/events/${event._id}`)).status, 403);

    const updated = await alice.api.put(`/events/${event._id}`, { name: 'Nouveau nom', shoppingListEnabled: true });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.name, 'Nouveau nom');
    assert.equal(updated.body.data.shoppingListEnabled, true);

    assert.equal((await alice.api.put(`/events/${event._id}`, { endDate: dates.inDays(1) })).status, 400);
    assert.equal((await alice.api.delete(`/events/${event._id}`)).status, 204);
    assert.equal((await alice.api.get(`/events/${event._id}`)).status, 404);
  });

  it('règle 2.2 : gère une multitude de participants', async () => {
    const event = await createEvent(alice, { visibility: 'public' });

    assert.equal((await bob.api.post(`/events/${event._id}/participants`, { userId: chloe._id })).status, 403);
    const added = await alice.api.post(`/events/${event._id}/participants`, { userIds: [bob._id, chloe._id] });
    assert.equal(added.status, 200);
    assert.equal(added.body.data.participants.length, 2);

    const joined = await dan.api.post(`/events/${event._id}/join`);
    assert.equal(joined.body.data.participants.length, 3);

    const list = await dan.api.get(`/events/${event._id}/participants`);
    assert.deepEqual(list.body.meta, { organizersCount: 1, participantsCount: 3 });
    assert.equal(list.body.data.participants[0].email, undefined);

    assert.equal((await bob.api.delete(`/events/${event._id}/participants/${chloe._id}`)).status, 403);
    assert.equal((await chloe.api.delete(`/events/${event._id}/participants/${chloe._id}`)).status, 204);
    assert.equal((await alice.api.delete(`/events/${event._id}/participants/${bob._id}`)).status, 204);
    assert.equal((await alice.api.delete(`/events/${event._id}/participants/${bob._id}`)).status, 404);
  });

  it('ne perd aucune inscription quand plusieurs personnes rejoignent en même temps', async () => {
    const event = await createEvent(alice, { visibility: 'public' });
    const guests = await Promise.all(Array.from({ length: 15 }, (unused, index) => createUser(`Invite${index}`)));

    const results = await Promise.all(guests.map((guest) => guest.api.post(`/events/${event._id}/join`)));
    assert.ok(results.every((res) => res.status === 200));
    const list = await alice.api.get(`/events/${event._id}/participants`);
    assert.equal(list.body.meta.participantsCount, 15);
  });

  it('règle 2.2 : garde toujours au moins un organisateur', async () => {
    const event = await createEvent(alice, { participants: [bob._id] });

    const last = await alice.api.delete(`/events/${event._id}/organizers/${alice._id}`);
    assert.equal(last.status, 409);

    assert.equal((await bob.api.post(`/events/${event._id}/organizers`, { userId: bob._id })).status, 403);
    const promoted = await alice.api.post(`/events/${event._id}/organizers`, { userId: bob._id });
    assert.deepEqual(ids(promoted.body.data.organizers).sort(), [alice._id, bob._id].sort());
    assert.equal(promoted.body.data.participants.length, 0);

    const demoted = await bob.api.delete(`/events/${event._id}/organizers/${alice._id}`);
    assert.deepEqual(ids(demoted.body.data.organizers), [bob._id]);
    assert.deepEqual(ids(demoted.body.data.participants), [alice._id]);
    assert.equal((await alice.api.put(`/events/${event._id}`, { name: 'x' })).status, 403);
  });

  it('fournit un résumé de l\'événement', async () => {
    const event = await createEvent(alice, { participants: [bob._id], carpoolingEnabled: true });
    const res = await bob.api.get(`/events/${event._id}/summary`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.myRole, 'participant');
    assert.equal(res.body.data.participantsCount, 1);
    assert.deepEqual(res.body.data.carpooling, { enabled: true, carpoolsCount: 0 });
    assert.equal(res.body.data.ticketing.enabled, false);
  });
});

describe('Groupes (CRUDS)', () => {
  it('crée un groupe avec ses paramètres, son créateur administrateur et un fil de discussion', async () => {
    const group = await createGroup(alice, {
      name: 'Club photo',
      icon: 'https://example.com/icon.png',
      coverPhoto: 'https://example.com/cover.jpg',
      type: 'private',
      allowMembersToPost: false,
      allowMembersToCreateEvents: true,
      members: [bob._id],
    });
    assert.equal(group.type, 'private');
    assert.equal(group.allowMembersToPost, false);
    assert.equal(group.allowMembersToCreateEvents, true);
    assert.deepEqual(ids(group.admins), [alice._id]);
    assert.deepEqual(ids(group.members).sort(), [alice._id, bob._id].sort());
    assert.equal(group.myRole, 'admin');

    const threads = await bob.api.get(`/groups/${group._id}/threads`);
    assert.equal(threads.body.data.length, 1);
    assert.equal(threads.body.data[0].title, 'Discussion générale');
  });

  it('valide le nom et le type du groupe', async () => {
    assert.equal((await alice.api.post('/groups', { type: 'public' })).status, 400);
    assert.equal((await alice.api.post('/groups', { name: 'X', type: 'ouvert' })).status, 400);
  });

  it('cache un groupe secret à ceux qui n\'en sont pas membres', async () => {
    const group = await createGroup(alice, { name: 'Projet confidentiel', type: 'secret', members: [bob._id] });

    assert.equal((await dan.api.get(`/groups/${group._id}`)).status, 404);
    assert.equal((await dan.api.post(`/groups/${group._id}/join`)).status, 404);
    assert.equal((await dan.api.get('/groups?q=confidentiel')).body.data.length, 0);

    assert.equal((await bob.api.get(`/groups/${group._id}`)).status, 200);
    assert.equal((await bob.api.get('/groups?q=confidentiel')).body.data.length, 1);
  });

  it('montre un groupe privé à tous mais réserve son contenu aux membres', async () => {
    const group = await createGroup(alice, { name: 'Voisins du quartier', type: 'private', members: [bob._id] });

    const outside = await dan.api.get(`/groups/${group._id}`);
    assert.equal(outside.status, 200);
    assert.equal(outside.body.data.membersCount, 2);
    assert.equal(outside.body.data.members, undefined);
    assert.equal(outside.body.data.myRole, 'none');

    assert.equal((await dan.api.get(`/groups/${group._id}/members`)).status, 403);
    assert.equal((await dan.api.get(`/groups/${group._id}/threads`)).status, 403);
    assert.equal((await dan.api.post(`/groups/${group._id}/join`)).status, 403);
    assert.equal((await bob.api.get(`/groups/${group._id}/members`)).status, 200);
  });

  it('règle 2.3 : gère les membres d\'un groupe', async () => {
    const group = await createGroup(alice, { name: 'Coureurs', type: 'public' });

    const joined = await bob.api.post(`/groups/${group._id}/join`);
    assert.equal(joined.body.data.membersCount, 2);
    assert.equal(joined.body.data.myRole, 'member');

    assert.equal((await bob.api.post(`/groups/${group._id}/members`, { userId: chloe._id })).status, 403);
    const added = await alice.api.post(`/groups/${group._id}/members`, { userIds: [chloe._id, dan._id] });
    assert.equal(added.body.data.membersCount, 4);

    assert.equal((await bob.api.delete(`/groups/${group._id}/members/${chloe._id}`)).status, 403);
    assert.equal((await chloe.api.delete(`/groups/${group._id}/members/${chloe._id}`)).status, 204);
    assert.equal((await alice.api.delete(`/groups/${group._id}/members/${dan._id}`)).status, 204);
    assert.equal((await alice.api.get(`/groups/${group._id}/members`)).body.meta.membersCount, 2);
  });

  it('règle 2.3 : garde toujours au moins un administrateur', async () => {
    const group = await createGroup(alice, { members: [bob._id] });

    assert.equal((await alice.api.delete(`/groups/${group._id}/admins/${alice._id}`)).status, 409);
    assert.equal((await alice.api.delete(`/groups/${group._id}/members/${alice._id}`)).status, 409);

    assert.equal((await bob.api.post(`/groups/${group._id}/admins`, { userId: bob._id })).status, 403);
    const promoted = await alice.api.post(`/groups/${group._id}/admins`, { userId: chloe._id });
    assert.equal(promoted.body.data.adminsCount, 2);
    assert.equal(promoted.body.data.membersCount, 3, 'un administrateur est aussi membre');

    const demoted = await chloe.api.delete(`/groups/${group._id}/admins/${alice._id}`);
    assert.deepEqual(ids(demoted.body.data.admins), [chloe._id]);
    assert.equal(demoted.body.data.membersCount, 3, 'l\'ancien administrateur reste membre');
  });

  it('ne laisse que les administrateurs modifier ou supprimer le groupe', async () => {
    const group = await createGroup(alice, { members: [bob._id] });
    assert.equal((await bob.api.put(`/groups/${group._id}`, { name: 'Piraté' })).status, 403);
    assert.equal((await bob.api.delete(`/groups/${group._id}`)).status, 403);

    const updated = await alice.api.put(`/groups/${group._id}`, { name: 'Renommé', type: 'secret' });
    assert.equal(updated.body.data.name, 'Renommé');
    assert.equal(updated.body.data.type, 'secret');
  });
});

describe('Événements dans un groupe (cahier des charges 1.2)', () => {
  it('invite automatiquement tous les membres du groupe à la création', async () => {
    const group = await createGroup(alice, { members: [bob._id, chloe._id] });
    const event = await createEvent(alice, { group: group._id, visibility: 'private' });

    assert.equal(event.group._id, group._id);
    assert.deepEqual(ids(event.participants).sort(), [bob._id, chloe._id].sort());
    assert.equal((await chloe.api.get(`/events/${event._id}`)).status, 200);

    const list = await bob.api.get(`/groups/${group._id}/events`);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].myRole, 'participant');
  });

  it('ne révèle pas un groupe secret à travers un événement public', async () => {
    const group = await createGroup(alice, { name: 'Cercle secret', type: 'secret', members: [bob._id] });
    const event = await createEvent(alice, { group: group._id, visibility: 'public' });

    assert.equal((await bob.api.get(`/events/${event._id}`)).body.data.group.name, 'Cercle secret');
    const outside = await dan.api.get(`/events/${event._id}`);
    assert.equal(outside.status, 200);
    assert.equal(outside.body.data.group, null);
    assert.ok(!JSON.stringify(outside.body).includes('Cercle secret'));
  });

  it('respecte le choix d\'autoriser les membres à créer des événements', async () => {
    const group = await createGroup(alice, { members: [bob._id], allowMembersToCreateEvents: false });
    const body = { name: 'Sortie', location: 'Forêt', startDate: dates.inDays(3), endDate: dates.inDays(4), group: group._id };

    assert.equal((await bob.api.post('/events', body)).status, 403);
    assert.equal((await dan.api.post('/events', body)).status, 403);

    await alice.api.put(`/groups/${group._id}`, { allowMembersToCreateEvents: true });
    const created = await bob.api.post('/events', body);
    assert.equal(created.status, 201);
    assert.deepEqual(ids(created.body.data.organizers), [bob._id]);
    assert.deepEqual(ids(created.body.data.participants), [alice._id]);
  });

  it('invite en un clic les membres arrivés après la création', async () => {
    const group = await createGroup(alice, { members: [bob._id] });
    const event = await createEvent(alice, { group: group._id });
    await alice.api.post(`/groups/${group._id}/members`, { userIds: [chloe._id, dan._id] });

    assert.equal((await bob.api.post(`/events/${event._id}/invite-group`)).status, 403);
    const res = await alice.api.post(`/events/${event._id}/invite-group`);
    assert.equal(res.status, 200);
    assert.equal(res.body.meta.invitedCount, 2);
    assert.equal(res.body.data.participants.length, 3);

    const standalone = await createEvent(alice);
    assert.equal((await alice.api.post(`/events/${standalone._id}/invite-group`)).status, 409);
  });

  it('propose le partage sur les autres réseaux uniquement dans un groupe public', async () => {
    const publicGroup = await createGroup(alice, { type: 'public', members: [bob._id] });
    const privateGroup = await createGroup(alice, { type: 'private' });
    const shared = await createEvent(alice, { name: 'Fête des voisins', group: publicGroup._id });
    const hidden = await createEvent(alice, { group: privateGroup._id });
    const standalone = await createEvent(alice);

    const res = await alice.api.get(`/events/${shared._id}/share`);
    assert.equal(res.status, 200);
    assert.match(res.body.data.url, new RegExp(`/events/${shared._id}$`));
    assert.deepEqual(Object.keys(res.body.data.links).sort(), ['email', 'linkedin', 'telegram', 'whatsapp', 'x']);
    assert.match(res.body.data.links.linkedin, /^https:\/\/www\.linkedin\.com\//);

    assert.equal((await bob.api.get(`/events/${shared._id}/share`)).status, 403);
    assert.equal((await alice.api.get(`/events/${hidden._id}/share`)).status, 409);
    assert.equal((await alice.api.get(`/events/${standalone._id}/share`)).status, 409);
  });

  it('supprime les fils du groupe et détache ses événements quand le groupe est supprimé', async () => {
    const group = await createGroup(alice);
    const event = await createEvent(alice, { group: group._id });
    const [thread] = (await alice.api.get(`/groups/${group._id}/threads`)).body.data;

    assert.equal((await alice.api.delete(`/groups/${group._id}`)).status, 204);
    assert.equal((await alice.api.get(`/groups/${group._id}`)).status, 404);
    assert.equal((await alice.api.get(`/threads/${thread._id}`)).status, 404);
    assert.equal((await alice.api.get(`/events/${event._id}`)).body.data.group, null);
  });
});
