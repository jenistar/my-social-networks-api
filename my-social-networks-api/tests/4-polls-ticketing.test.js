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

describe('Sondages (CRUDS)', () => {
  let event;
  let poll;
  const questions = [
    { text: 'Quel jour vous convient ?', answers: ['Samedi', 'Dimanche'] },
    { text: 'Quel repas ?', answers: [{ text: 'Barbecue' }, { text: 'Buffet froid' }, { text: 'Pizza' }] },
  ];
  // Construit le corps d'une réponse à partir des positions choisies : pick(0, 2) = Samedi + Pizza.
  const pick = (...choices) => ({
    answers: choices.map((choice, index) => ({
      question: poll.questions[index]._id,
      answer: poll.questions[index].answers[choice]._id,
    })),
  });

  before(async () => {
    event = await createEvent(alice, { visibility: 'public', participants: [bob._id, chloe._id] });
  });

  it('règle 2.6 : un sondage est créé par un organisateur', async () => {
    const body = { title: 'Organisation du repas', questions };
    assert.equal((await bob.api.post(`/events/${event._id}/polls`, body)).status, 403);
    assert.equal((await dan.api.post(`/events/${event._id}/polls`, body)).status, 403);

    const res = await alice.api.post(`/events/${event._id}/polls`, body);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.questions.length, 2);
    assert.equal(res.body.data.questions[1].answers.length, 3);
    assert.ok(res.body.data.questions[0].answers[0]._id);
    poll = res.body.data;
  });

  it('règle 2.6 : un sondage a au moins une question, et chaque question plusieurs réponses possibles', async () => {
    const url = `/events/${event._id}/polls`;
    assert.equal((await alice.api.post(url, { title: 'Vide', questions: [] })).status, 400);
    assert.equal((await alice.api.post(url, { title: 'Sans questions' })).status, 400);
    assert.equal((await alice.api.post(url, { title: 'Une seule réponse', questions: [{ text: 'Q', answers: ['Oui'] }] })).status, 400);
    assert.equal((await alice.api.post(url, { questions })).status, 400, 'le titre est obligatoire');
  });

  it('règle 2.6 : un participant choisit une seule réponse pour chaque question', async () => {
    const url = `/polls/${poll._id}/responses`;
    const [q1, q2] = poll.questions;

    assert.equal((await dan.api.post(url, pick(0, 0))).status, 403, 'réservé aux participants');

    const incomplete = await bob.api.post(url, { answers: [{ question: q1._id, answer: q1.answers[0]._id }] });
    assert.equal(incomplete.status, 400);
    assert.match(incomplete.body.error.message, /chaque question/);

    const twice = await bob.api.post(url, {
      answers: [
        { question: q1._id, answer: q1.answers[0]._id },
        { question: q1._id, answer: q1.answers[1]._id },
        { question: q2._id, answer: q2.answers[0]._id },
      ],
    });
    assert.equal(twice.status, 400);
    assert.match(twice.body.error.message, /Une seule réponse/);

    const wrongAnswer = await bob.api.post(url, {
      answers: [
        { question: q1._id, answer: q2.answers[0]._id },
        { question: q2._id, answer: q2.answers[0]._id },
      ],
    });
    assert.equal(wrongAnswer.status, 400);

    const ok = await bob.api.post(url, pick(0, 2));
    assert.equal(ok.status, 201);
    assert.equal(ok.body.data.answers.length, 2);
  });

  it('ne laisse répondre qu\'une fois, mais permet de modifier sa réponse', async () => {
    assert.equal((await bob.api.post(`/polls/${poll._id}/responses`, pick(1, 1))).status, 409);

    const updated = await bob.api.put(`/polls/${poll._id}/responses/me`, pick(1, 2));
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.answers[0].answer, poll.questions[0].answers[1]._id);

    assert.equal((await bob.api.get(`/polls/${poll._id}/responses/me`)).status, 200);
    assert.equal((await chloe.api.get(`/polls/${poll._id}/responses/me`)).status, 404);
  });

  it('calcule les résultats du sondage', async () => {
    await chloe.api.post(`/polls/${poll._id}/responses`, pick(1, 0));
    await alice.api.post(`/polls/${poll._id}/responses`, pick(0, 2));

    const res = await dan.api.get(`/polls/${poll._id}/results`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.totalResponses, 3);
    const votes = res.body.data.questions.map((question) => question.answers.map((answer) => answer.votes));
    assert.deepEqual(votes, [[1, 2], [1, 0, 2]]);
    assert.equal(res.body.data.questions[0].answers[1].percentage, 66.7);

    const detail = await bob.api.get(`/polls/${poll._id}`);
    assert.equal(detail.body.data.responsesCount, 3);
    assert.equal(detail.body.data.hasResponded, true);

    assert.equal((await bob.api.get(`/polls/${poll._id}/responses`)).status, 403);
    assert.equal((await alice.api.get(`/polls/${poll._id}/responses`)).body.data.length, 3);
  });

  it('bloque la modification des questions après les premières réponses', async () => {
    assert.equal((await bob.api.put(`/polls/${poll._id}`, { title: 'Non' })).status, 403);
    assert.equal((await alice.api.put(`/polls/${poll._id}`, { title: 'Nouveau titre' })).body.data.title, 'Nouveau titre');
    assert.equal((await alice.api.put(`/polls/${poll._id}`, { questions })).status, 409);
  });

  it('recherche les sondages d\'un événement et supprime un sondage avec ses réponses', async () => {
    assert.equal((await bob.api.get(`/events/${event._id}/polls?q=repas`)).body.data.length, 1);
    assert.equal((await bob.api.get(`/events/${event._id}/polls?q=introuvable`)).body.data.length, 0);

    assert.equal((await bob.api.delete(`/polls/${poll._id}/responses/me`)).status, 204);
    assert.equal((await bob.api.delete(`/polls/${poll._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/polls/${poll._id}`)).status, 204);
    assert.equal((await alice.api.get(`/polls/${poll._id}`)).status, 404);
  });
});

describe('Billetterie (CRUDS)', () => {
  let event;
  let standard;
  let vip;
  const buyer = (overrides = {}) => ({
    lastName: 'Martin',
    firstName: 'Élodie',
    address: { street: '12 rue des Lilas', postalCode: '95000', city: 'Cergy', country: 'France' },
    ...overrides,
  });

  before(async () => {
    event = await createEvent(alice, { visibility: 'public', participants: [bob._id] });
  });

  it('règle 2.7 : seul un événement public possède une billetterie', async () => {
    const hidden = await createEvent(alice, { visibility: 'private' });
    const body = { name: 'Standard', amount: 20, quantity: 10 };
    assert.equal((await alice.api.post(`/events/${hidden._id}/ticket-types`, body)).status, 403);
    assert.equal((await anonymous.get(`/events/${hidden._id}/ticket-types`)).status, 403);
  });

  it('règle 2.7 : un organisateur crée un ou plusieurs types de billets', async () => {
    const url = `/events/${event._id}/ticket-types`;
    assert.equal((await bob.api.post(url, { name: 'Standard', amount: 20, quantity: 10 })).status, 403);
    assert.equal((await anonymous.post(url, { name: 'Standard', amount: 20, quantity: 10 })).status, 401);

    const invalid = await alice.api.post(url, { amount: -5, quantity: 0 });
    assert.equal(invalid.status, 400);
    assert.deepEqual(Object.keys(invalid.body.error.details).sort(), ['amount', 'name', 'quantity']);

    const first = await alice.api.post(url, { name: 'Standard', amount: 20, quantity: 2 });
    assert.equal(first.status, 201);
    assert.equal(first.body.data.remaining, 2);
    standard = first.body.data;
    vip = (await alice.api.post(url, { name: 'VIP', amount: 80, quantity: 1 })).body.data;

    assert.equal((await alice.api.post(url, { name: 'Standard', amount: 25, quantity: 5 })).status, 409, 'nom déjà pris');
  });

  it('montre les billets en vente à une personne extérieure, sans compte', async () => {
    const res = await anonymous.get(`/events/${event._id}/ticket-types`);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.map((type) => [type.name, type.amount, type.remaining]), [['Standard', 20, 2], ['VIP', 80, 1]]);
    assert.equal((await anonymous.get(`/ticket-types/${vip._id}`)).body.data.name, 'VIP');
  });

  it('règle 2.7 : enregistre le type, le nom, le prénom, l\'adresse complète et la date d\'achat', async () => {
    const before = Date.now();
    const res = await anonymous.post(`/events/${event._id}/tickets`, { ticketType: standard._id, ...buyer() });
    assert.equal(res.status, 201);

    const ticket = res.body.data;
    assert.equal(ticket.ticketType.name, 'Standard');
    assert.equal(ticket.lastName, 'Martin');
    assert.equal(ticket.firstName, 'Élodie');
    assert.deepEqual(ticket.address, { street: '12 rue des Lilas', postalCode: '95000', city: 'Cergy', country: 'France' });
    assert.ok(new Date(ticket.purchasedAt).getTime() >= before - 1000);
    assert.equal(ticket.buyerKey, undefined);
  });

  it('exige toutes les données de la personne', async () => {
    const url = `/events/${event._id}/tickets`;
    const noAddress = await anonymous.post(url, { ticketType: standard._id, lastName: 'Durand', firstName: 'Paul' });
    assert.equal(noAddress.status, 400);
    assert.deepEqual(Object.keys(noAddress.body.error.details).sort(), [
      'address.city',
      'address.country',
      'address.postalCode',
      'address.street',
    ]);
    assert.equal((await anonymous.post(url, buyer())).status, 400, 'le type de billet est obligatoire');
    assert.equal((await anonymous.post(url, { ticketType: '64b000000000000000000000', ...buyer({ lastName: 'X' }) })).status, 404);
  });

  it('règle 2.7 : une personne extérieure ne peut obtenir qu\'un seul billet', async () => {
    const url = `/events/${event._id}/tickets`;
    const same = await anonymous.post(url, { ticketType: standard._id, ...buyer() });
    assert.equal(same.status, 409);

    // Même personne écrite autrement (majuscules, accents, espaces) et sur un autre type de billet.
    const disguised = await anonymous.post(url, {
      ticketType: vip._id,
      ...buyer({ lastName: '  MARTIN ', firstName: 'elodie' }),
    });
    assert.equal(disguised.status, 409);

    const types = (await anonymous.get(`/events/${event._id}/ticket-types`)).body.data;
    assert.deepEqual(types.map((type) => type.sold), [1, 0], 'un achat refusé ne consomme pas de billet');
  });

  it('règle 2.7 : respecte la quantité limitée de billets', async () => {
    const url = `/events/${event._id}/tickets`;
    assert.equal((await anonymous.post(url, { ticketType: vip._id, ...buyer({ lastName: 'Bernard' }) })).status, 201);

    const soldOut = await anonymous.post(url, { ticketType: vip._id, ...buyer({ lastName: 'Petit' }) });
    assert.equal(soldOut.status, 409);
    assert.match(soldOut.body.error.message, /plus de billets/);
    assert.equal((await anonymous.get(`/ticket-types/${vip._id}`)).body.data.remaining, 0);
  });

  it('ne vend jamais plus de billets que la quantité, même avec des achats simultanés', async () => {
    const type = (await alice.api.post(`/events/${event._id}/ticket-types`, { name: 'Dernière minute', amount: 5, quantity: 3 })).body.data;
    const attempts = await Promise.all(
      Array.from({ length: 12 }, (unused, index) =>
        anonymous.post(`/events/${event._id}/tickets`, { ticketType: type._id, ...buyer({ lastName: `Acheteur${index}` }) }),
      ),
    );
    const statuses = attempts.map((res) => res.status);
    assert.equal(statuses.filter((status) => status === 201).length, 3);
    assert.equal(statuses.filter((status) => status === 409).length, 9);

    const after = (await anonymous.get(`/ticket-types/${type._id}`)).body.data;
    assert.equal(after.sold, 3);
    assert.equal(after.remaining, 0);
  });

  it('réserve la liste des billets vendus aux organisateurs', async () => {
    const url = `/events/${event._id}/tickets`;
    assert.equal((await anonymous.get(url)).status, 401);
    assert.equal((await bob.api.get(url)).status, 403);

    const all = await alice.api.get(url);
    assert.equal(all.body.meta.total, 5);
    const search = await alice.api.get(`${url}?q=martin`);
    assert.equal(search.body.data.length, 1);
    assert.equal((await alice.api.get(`${url}?ticketType=${vip._id}`)).body.data.length, 1);
    assert.equal((await bob.api.get(`/tickets/${search.body.data[0]._id}`)).status, 403);
    assert.equal((await alice.api.get(`/tickets/${search.body.data[0]._id}`)).body.data.lastName, 'Martin');
  });

  it('laisse un organisateur corriger ou annuler un billet', async () => {
    const [ticket] = (await alice.api.get(`/events/${event._id}/tickets?q=bernard`)).body.data;

    const fixed = await alice.api.put(`/tickets/${ticket._id}`, { address: { city: 'Pontoise' } });
    assert.equal(fixed.status, 200);
    assert.equal(fixed.body.data.address.city, 'Pontoise');
    assert.equal(fixed.body.data.address.street, '12 rue des Lilas');

    // On ne peut pas transformer un billet en doublon d'une personne déjà inscrite.
    assert.equal((await alice.api.put(`/tickets/${ticket._id}`, { lastName: 'Martin', address: { city: 'Cergy' } })).status, 409);

    assert.equal((await alice.api.delete(`/tickets/${ticket._id}`)).status, 204);
    assert.equal((await anonymous.get(`/ticket-types/${vip._id}`)).body.data.remaining, 1, 'la place redevient disponible');
  });

  it('protège la cohérence de la billetterie', async () => {
    // La quantité ne descend pas sous le nombre de billets vendus.
    assert.equal((await alice.api.put(`/ticket-types/${standard._id}`, { quantity: 0 })).status, 400);
    const raised = await alice.api.put(`/ticket-types/${standard._id}`, { quantity: 50, amount: 22 });
    assert.equal(raised.body.data.remaining, 49);
    const type = (await alice.api.post(`/events/${event._id}/ticket-types`, { name: 'Groupe', amount: 10, quantity: 5 })).body.data;
    await anonymous.post(`/events/${event._id}/tickets`, { ticketType: type._id, ...buyer({ lastName: 'Un' }) });
    await anonymous.post(`/events/${event._id}/tickets`, { ticketType: type._id, ...buyer({ lastName: 'Deux' }) });
    assert.equal((await alice.api.put(`/ticket-types/${type._id}`, { quantity: 1 })).status, 409);

    // Un type avec des billets vendus ne se supprime pas, et l'événement doit rester public.
    assert.equal((await alice.api.delete(`/ticket-types/${type._id}`)).status, 409);
    assert.equal((await bob.api.delete(`/ticket-types/${vip._id}`)).status, 403);
    assert.equal((await alice.api.delete(`/ticket-types/${vip._id}`)).status, 204);
    assert.equal((await alice.api.put(`/events/${event._id}`, { visibility: 'private' })).status, 409);
  });

  it('ferme la billetterie quand l\'événement est terminé', async () => {
    const past = await createEvent(alice, { visibility: 'public', startDate: dates.inDays(-3), endDate: dates.inDays(-2) });
    const type = (await alice.api.post(`/events/${past._id}/ticket-types`, { name: 'Standard', amount: 1, quantity: 5 })).body.data;
    assert.equal((await anonymous.post(`/events/${past._id}/tickets`, { ticketType: type._id, ...buyer() })).status, 409);
  });
});
