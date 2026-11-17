import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createEvent, createGroup, createUser, startTestDb, stopTestDb } from './helpers.js';

let alice;
let bob;
let dan;

before(async () => {
  await startTestDb();
  [alice, bob, dan] = await Promise.all(['Alice', 'Bob', 'Dan'].map((name) => createUser(name)));
});
after(stopTestDb);

const defaultThread = async (user, group) => (await user.api.get(`/groups/${group._id}/threads`)).body.data[0];

describe('Fils de discussion (CRUDS)', () => {
  it('règle 2.4 : un fil est lié à un groupe ou à un événement, jamais aux deux', async () => {
    const group = await createGroup(alice);
    const event = await createEvent(alice);

    const both = await alice.api.post('/threads', { title: 'Impossible', group: group._id, event: event._id });
    assert.equal(both.status, 400);
    assert.equal((await alice.api.post('/threads', { title: 'Orphelin' })).status, 400);

    const forGroup = await alice.api.post('/threads', { title: 'Organisation', group: group._id });
    assert.equal(forGroup.status, 201);
    assert.equal(forGroup.body.data.group, group._id);
    assert.equal(forGroup.body.data.event, null);

    const forEvent = await alice.api.post('/threads', { title: 'Questions pratiques', event: event._id });
    assert.equal(forEvent.status, 201);
    assert.equal(forEvent.body.data.event, event._id);
    assert.equal(forEvent.body.data.group, null);

    assert.equal((await alice.api.post('/threads', { group: group._id })).status, 400, 'le titre est obligatoire');
  });

  it('réserve la création, la modification et la suppression d\'un fil aux responsables', async () => {
    const group = await createGroup(alice, { members: [bob._id] });
    const event = await createEvent(alice, { participants: [bob._id] });

    assert.equal((await bob.api.post('/threads', { title: 'Non', group: group._id })).status, 403);
    assert.equal((await bob.api.post('/threads', { title: 'Non', event: event._id })).status, 403);

    const thread = (await alice.api.post('/threads', { title: 'Avant', event: event._id })).body.data;
    assert.equal((await bob.api.put(`/threads/${thread._id}`, { title: 'Piraté' })).status, 403);
    const renamed = await alice.api.put(`/threads/${thread._id}`, { title: 'Après', group: group._id });
    assert.equal(renamed.body.data.title, 'Après');
    assert.equal(renamed.body.data.group, null, 'le rattachement ne change pas');

    assert.equal((await bob.api.delete(`/threads/${thread._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/threads/${thread._id}`)).status, 204);
  });

  it('recherche les fils par groupe, par événement ou parmi tous les miens', async () => {
    const group = await createGroup(alice, { name: 'Recherche', members: [bob._id] });
    const event = await createEvent(alice, { visibility: 'private' });
    await alice.api.post('/threads', { title: 'Covoiturage du samedi', group: group._id });
    await alice.api.post('/threads', { title: 'Programme', event: event._id });

    assert.equal((await bob.api.get(`/threads?group=${group._id}`)).body.data.length, 2);
    assert.equal((await bob.api.get(`/threads?group=${group._id}&q=covoit`)).body.data.length, 1);
    assert.equal((await alice.api.get(`/threads?event=${event._id}`)).body.data.length, 1);
    assert.equal((await bob.api.get(`/threads?event=${event._id}`)).status, 403);
    assert.equal((await bob.api.get(`/threads?group=${group._id}&event=${event._id}`)).status, 400);

    const mine = await bob.api.get('/threads?q=covoit');
    assert.equal(mine.body.data.length, 1);
    assert.equal((await dan.api.get('/threads?q=covoit')).body.data.length, 0);
  });

  it('garde toujours un fil de discussion dans un groupe', async () => {
    const group = await createGroup(alice);
    const thread = await defaultThread(alice, group);
    assert.equal((await alice.api.delete(`/threads/${thread._id}`)).status, 409);
  });
});

describe('Messages et commentaires', () => {
  it('respecte le choix d\'autoriser les membres à publier dans le groupe', async () => {
    const group = await createGroup(alice, { members: [bob._id], allowMembersToPost: false });
    const thread = await defaultThread(alice, group);

    assert.equal((await bob.api.post(`/threads/${thread._id}/messages`, { content: 'Bonjour' })).status, 403);
    const fromAdmin = await alice.api.post(`/threads/${thread._id}/messages`, { content: 'Annonce importante' });
    assert.equal(fromAdmin.status, 201);
    assert.equal(fromAdmin.body.data.author.firstName, 'Alice');

    // Règle 2.4 : chaque membre peut commenter un message.
    const comment = await bob.api.post(`/messages/${fromAdmin.body.data._id}/comments`, { content: 'Bien noté' });
    assert.equal(comment.status, 201);

    await alice.api.put(`/groups/${group._id}`, { allowMembersToPost: true });
    assert.equal((await bob.api.post(`/threads/${thread._id}/messages`, { content: 'Bonjour' })).status, 201);

    const detail = await bob.api.get(`/threads/${thread._id}`);
    assert.equal(detail.body.data.messagesCount, 2);
    assert.equal(detail.body.data.permissions.canPost, true);
    assert.equal(detail.body.data.permissions.canManage, false);
  });

  it('laisse lire un groupe public à tous mais publier seulement aux membres', async () => {
    const group = await createGroup(alice, { type: 'public' });
    const thread = await defaultThread(alice, group);
    const message = (await alice.api.post(`/threads/${thread._id}/messages`, { content: 'Bienvenue à tous' })).body.data;

    assert.equal((await dan.api.get(`/threads/${thread._id}/messages`)).body.data.length, 1);
    assert.equal((await dan.api.post(`/threads/${thread._id}/messages`, { content: 'Spam' })).status, 403);
    assert.equal((await dan.api.post(`/messages/${message._id}/comments`, { content: 'Spam' })).status, 403);
  });

  it('ferme les fils d\'un groupe privé et d\'un événement privé aux personnes extérieures', async () => {
    const group = await createGroup(alice, { type: 'private' });
    const groupThread = await defaultThread(alice, group);
    const event = await createEvent(alice, { visibility: 'private', participants: [bob._id] });
    const eventThread = (await alice.api.post('/threads', { title: 'Infos', event: event._id })).body.data;
    const message = (await bob.api.post(`/threads/${eventThread._id}/messages`, { content: 'Je serai là' })).body.data;

    for (const url of [
      `/threads/${groupThread._id}`,
      `/threads/${groupThread._id}/messages`,
      `/threads/${eventThread._id}/messages`,
      `/messages/${message._id}`,
      `/messages/${message._id}/comments`,
    ]) {
      assert.equal((await dan.api.get(url)).status, 403, url);
    }
  });

  it('règle 2.4 : les messages d\'un événement viennent des participants et des organisateurs', async () => {
    const event = await createEvent(alice, { visibility: 'public', participants: [bob._id] });
    const thread = (await alice.api.post('/threads', { title: 'Discussion', event: event._id })).body.data;

    assert.equal((await alice.api.post(`/threads/${thread._id}/messages`, { content: 'Message organisateur' })).status, 201);
    const fromBob = await bob.api.post(`/threads/${thread._id}/messages`, { content: 'Message participant' });
    assert.equal(fromBob.status, 201);
    assert.equal((await dan.api.post(`/threads/${thread._id}/messages`, { content: 'Extérieur' })).status, 403);
    assert.equal((await bob.api.post(`/threads/${thread._id}/messages`, { content: '   ' })).status, 400);

    const list = await dan.api.get(`/threads/${thread._id}/messages?q=participant`);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].author.firstName, 'Bob');
    assert.equal(list.body.data[0].author.email, undefined);
  });

  it('laisse l\'auteur modifier, et l\'auteur ou un responsable supprimer', async () => {
    const event = await createEvent(alice, { participants: [bob._id, dan._id] });
    const thread = (await alice.api.post('/threads', { title: 'Discussion', event: event._id })).body.data;
    const message = (await bob.api.post(`/threads/${thread._id}/messages`, { content: 'Version 1' })).body.data;
    const comment = (await dan.api.post(`/messages/${message._id}/comments`, { content: 'Réponse 1' })).body.data;

    assert.equal((await alice.api.put(`/messages/${message._id}`, { content: 'Modifié par un autre' })).status, 403);
    assert.equal((await bob.api.put(`/messages/${message._id}`, { content: 'Version 2' })).body.data.content, 'Version 2');
    assert.equal((await dan.api.delete(`/messages/${message._id}`)).status, 403);

    assert.equal((await bob.api.put(`/comments/${comment._id}`, { content: 'Non' })).status, 403);
    assert.equal((await dan.api.put(`/comments/${comment._id}`, { content: 'Réponse 2' })).body.data.content, 'Réponse 2');
    assert.equal((await bob.api.delete(`/comments/${comment._id}`)).status, 403);
    assert.equal((await bob.api.get(`/messages/${message._id}/comments`)).body.data.length, 1);

    // Un organisateur peut supprimer le message, ce qui supprime aussi ses commentaires.
    assert.equal((await alice.api.delete(`/messages/${message._id}`)).status, 204);
    assert.equal((await dan.api.get(`/comments/${comment._id}`)).status, 404);
  });
});

describe('Albums photo (CRUDS)', () => {
  let event;
  let album;
  let photo;

  before(async () => {
    event = await createEvent(alice, { visibility: 'public', participants: [bob._id] });
  });

  it('règle 2.5 : un album est associé à un événement', async () => {
    assert.equal((await dan.api.post(`/events/${event._id}/albums`, { name: 'Extérieur' })).status, 403);
    assert.equal((await bob.api.post(`/events/${event._id}/albums`, {})).status, 400);

    const res = await bob.api.post(`/events/${event._id}/albums`, { name: 'Photos de la soirée', description: 'Les meilleures' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.event, event._id);
    album = res.body.data;

    assert.equal((await dan.api.get(`/events/${event._id}/albums?q=soirée`)).body.data.length, 1);
    assert.equal((await dan.api.get(`/events/${event._id}/albums?q=inconnu`)).body.data.length, 0);
  });

  it('règle 2.5 : les photos sont postées par les participants de l\'événement', async () => {
    assert.equal((await dan.api.post(`/albums/${album._id}/photos`, { url: 'https://example.com/a.jpg' })).status, 403);
    assert.equal((await bob.api.post(`/albums/${album._id}/photos`, { url: 'pas-une-url' })).status, 400);
    assert.equal((await bob.api.post(`/albums/${album._id}/photos`, { caption: 'sans url' })).status, 400);

    const res = await bob.api.post(`/albums/${album._id}/photos`, { url: 'https://example.com/a.jpg', caption: 'Le buffet' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.author.firstName, 'Bob');
    photo = res.body.data;

    const detail = await dan.api.get(`/albums/${album._id}`);
    assert.equal(detail.body.data.photosCount, 1);
    assert.equal((await dan.api.get(`/albums/${album._id}/photos?q=buffet`)).body.data.length, 1);
  });

  it('règle 2.5 : les photos sont commentées par les participants de l\'événement', async () => {
    assert.equal((await dan.api.post(`/photos/${photo._id}/comments`, { content: 'Extérieur' })).status, 403);
    const res = await alice.api.post(`/photos/${photo._id}/comments`, { content: 'Superbe photo' });
    assert.equal(res.status, 201);
    assert.equal(res.body.data.targetType, 'Photo');

    const list = await dan.api.get(`/photos/${photo._id}/comments`);
    assert.equal(list.body.data.length, 1);
    assert.equal(list.body.data[0].author.firstName, 'Alice');
  });

  it('réserve la modification à l\'auteur de la photo ou au créateur de l\'album', async () => {
    assert.equal((await alice.api.put(`/photos/${photo._id}`, { caption: 'Non' })).status, 403);
    assert.equal((await bob.api.put(`/photos/${photo._id}`, { caption: 'Le dessert' })).body.data.caption, 'Le dessert');

    assert.equal((await dan.api.put(`/albums/${album._id}`, { name: 'Non' })).status, 403);
    assert.equal((await alice.api.put(`/albums/${album._id}`, { name: 'Album officiel' })).body.data.name, 'Album officiel');
  });

  it('ferme les albums d\'un événement privé aux personnes extérieures', async () => {
    const hidden = await createEvent(alice, { visibility: 'private' });
    const hiddenAlbum = (await alice.api.post(`/events/${hidden._id}/albums`, { name: 'Privé' })).body.data;
    assert.equal((await dan.api.get(`/events/${hidden._id}/albums`)).status, 403);
    assert.equal((await dan.api.get(`/albums/${hiddenAlbum._id}`)).status, 403);
    assert.equal((await dan.api.get(`/albums/${hiddenAlbum._id}/photos`)).status, 403);
  });

  it('supprime un album avec ses photos et leurs commentaires', async () => {
    assert.equal((await dan.api.delete(`/albums/${album._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/albums/${album._id}`)).status, 204);
    assert.equal((await alice.api.get(`/photos/${photo._id}`)).status, 404);
    assert.equal((await alice.api.get(`/photos/${photo._id}/comments`)).status, 404);
  });

  it('supprime tout le contenu d\'un événement quand il est supprimé', async () => {
    const other = await createEvent(alice);
    const otherAlbum = (await alice.api.post(`/events/${other._id}/albums`, { name: 'A' })).body.data;
    const thread = (await alice.api.post('/threads', { title: 'T', event: other._id })).body.data;

    assert.equal((await alice.api.delete(`/events/${other._id}`)).status, 204);
    assert.equal((await alice.api.get(`/albums/${otherAlbum._id}`)).status, 404);
    assert.equal((await alice.api.get(`/threads/${thread._id}`)).status, 404);
  });
});
