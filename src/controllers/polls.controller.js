import { Poll, PollResponse, USER_PUBLIC_FIELDS } from '../models/index.js';
import { assertCanViewEvent, assertEventMember, assertOrganizer, loadEvent } from '../services/access.js';
import { deletePoll as deletePollCascade } from '../services/cascade.js';
import { ApiError } from '../utils/ApiError.js';
import { isObjectId, paginate, parsePagination, sameId, searchFilter } from '../utils/helpers.js';

async function loadPoll(id, user) {
  const poll = await Poll.findById(id);
  if (!poll) throw ApiError.notFound('Sondage introuvable');
  const event = await loadEvent(poll.event);
  assertCanViewEvent(event, user);
  return { poll, event };
}

// Accepte les réponses possibles sous forme de textes ("Oui") ou d'objets ({ "text": "Oui" }).
function normalizeQuestions(questions) {
  if (!Array.isArray(questions)) throw ApiError.badRequest('Le champ questions doit être une liste');
  return questions.map((question) => ({
    text: question?.text,
    answers: Array.isArray(question?.answers)
      ? question.answers.map((answer) => (typeof answer === 'string' ? { text: answer } : { text: answer?.text }))
      : [],
  }));
}

// Vérifie les réponses d'un participant.
// Règle 2.6 : une réponse pour chaque question, et une seule réponse choisie par question.
function validateAnswers(poll, answers) {
  if (!Array.isArray(answers)) throw ApiError.badRequest('Le champ answers doit être une liste');

  const chosen = new Map();
  for (const item of answers) {
    if (!isObjectId(item?.question) || !isObjectId(item?.answer)) {
      throw ApiError.badRequest('Chaque élément de answers doit contenir les identifiants question et answer');
    }
    const question = poll.questions.id(item.question);
    if (!question) throw ApiError.badRequest(`La question ${item.question} n'appartient pas à ce sondage`);
    if (!question.answers.id(item.answer)) {
      throw ApiError.badRequest(`La réponse ${item.answer} n'est pas proposée pour la question "${question.text}"`);
    }
    if (chosen.has(String(question._id))) {
      throw ApiError.badRequest(`Une seule réponse est possible pour la question "${question.text}"`);
    }
    chosen.set(String(question._id), item.answer);
  }

  if (chosen.size !== poll.questions.length) {
    throw ApiError.badRequest('Vous devez choisir une réponse pour chaque question du sondage');
  }
  return [...chosen].map(([question, answer]) => ({ question, answer }));
}

// ---------- Sondages ----------

// POST /events/:eventId/polls : règle 2.6, un sondage est créé par un organisateur.
export async function createPoll(req, res) {
  const event = await loadEvent(req.params.eventId);
  assertOrganizer(event, req.user);
  const poll = await Poll.create({
    title: req.body?.title,
    questions: normalizeQuestions(req.body?.questions),
    event: event._id,
    createdBy: req.user._id,
  });
  res.status(201).json({ data: poll });
}

// GET /events/:eventId/polls : sondages de l'événement.
export async function listPolls(req, res) {
  const event = await loadEvent(req.params.eventId);
  assertCanViewEvent(event, req.user);
  const search = searchFilter(req.query.q, ['title', 'questions.text']);
  const result = await paginate(Poll, { event: event._id, ...(search ?? {}) }, parsePagination(req.query));
  res.json(result);
}

// GET /polls/:id : détail d'un sondage avec ses questions et ses réponses possibles.
export async function getPoll(req, res) {
  const { poll } = await loadPoll(req.params.id, req.user);
  const [responsesCount, myResponse] = await Promise.all([
    PollResponse.countDocuments({ poll: poll._id }),
    PollResponse.exists({ poll: poll._id, user: req.user._id }),
  ]);
  res.json({ data: { ...poll.toObject(), responsesCount, hasResponded: Boolean(myResponse) } });
}

// PUT /polls/:id : modification par un organisateur.
export async function updatePoll(req, res) {
  const { poll, event } = await loadPoll(req.params.id, req.user);
  assertOrganizer(event, req.user);

  if (req.body?.title !== undefined) poll.title = req.body.title;
  if (req.body?.questions !== undefined) {
    // Changer les questions rendrait les réponses déjà données incohérentes.
    if (await PollResponse.exists({ poll: poll._id })) {
      throw ApiError.conflict('Des participants ont déjà répondu. Les questions ne peuvent plus être modifiées.');
    }
    poll.questions = normalizeQuestions(req.body.questions);
  }
  await poll.save();
  res.json({ data: poll });
}

// DELETE /polls/:id : supprime le sondage et les réponses des participants.
export async function deletePoll(req, res) {
  const { poll, event } = await loadPoll(req.params.id, req.user);
  assertOrganizer(event, req.user);
  await deletePollCascade(poll._id);
  res.status(204).end();
}

// ---------- Réponses des participants ----------

// POST /polls/:id/responses : un participant répond au sondage (une seule fois).
export async function createResponse(req, res) {
  const { poll, event } = await loadPoll(req.params.id, req.user);
  assertEventMember(event, req.user);
  const answers = validateAnswers(poll, req.body?.answers);
  const response = await PollResponse.create({ poll: poll._id, event: event._id, user: req.user._id, answers });
  res.status(201).json({ data: response });
}

async function loadMyResponse(req) {
  const { poll, event } = await loadPoll(req.params.id, req.user);
  const response = await PollResponse.findOne({ poll: poll._id, user: req.user._id });
  if (!response) throw ApiError.notFound('Vous n\'avez pas encore répondu à ce sondage');
  return { poll, event, response };
}

// GET /polls/:id/responses/me : ma réponse à ce sondage.
export async function getMyResponse(req, res) {
  const { response } = await loadMyResponse(req);
  res.json({ data: response });
}

// PUT /polls/:id/responses/me : modifie ma réponse.
export async function updateMyResponse(req, res) {
  const { poll, response } = await loadMyResponse(req);
  response.answers = validateAnswers(poll, req.body?.answers);
  await response.save();
  res.json({ data: response });
}

// DELETE /polls/:id/responses/me : retire ma réponse.
export async function deleteMyResponse(req, res) {
  const { response } = await loadMyResponse(req);
  await response.deleteOne();
  res.status(204).end();
}

// GET /polls/:id/responses : réponses détaillées de chaque participant (organisateurs uniquement).
export async function listResponses(req, res) {
  const { poll, event } = await loadPoll(req.params.id, req.user);
  assertOrganizer(event, req.user);
  const result = await paginate(PollResponse, { poll: poll._id }, parsePagination(req.query), {
    populate: { path: 'user', select: USER_PUBLIC_FIELDS },
  });
  res.json(result);
}

// GET /polls/:id/results : résultats du sondage, avec le nombre de voix et le pourcentage par réponse.
export async function getResults(req, res) {
  const { poll } = await loadPoll(req.params.id, req.user);

  const [counts, totalResponses] = await Promise.all([
    PollResponse.aggregate([
      { $match: { poll: poll._id } },
      { $unwind: '$answers' },
      { $group: { _id: '$answers.answer', votes: { $sum: 1 } } },
    ]),
    PollResponse.countDocuments({ poll: poll._id }),
  ]);
  const votesOf = (answerId) => counts.find((count) => sameId(count._id, answerId))?.votes ?? 0;

  res.json({
    data: {
      poll: { _id: poll._id, title: poll.title, event: poll.event },
      totalResponses,
      questions: poll.questions.map((question) => ({
        _id: question._id,
        text: question.text,
        answers: question.answers.map((answer) => {
          const votes = votesOf(answer._id);
          return {
            _id: answer._id,
            text: answer.text,
            votes,
            percentage: totalResponses ? Math.round((votes / totalResponses) * 1000) / 10 : 0,
          };
        }),
      })),
    },
  });
}
