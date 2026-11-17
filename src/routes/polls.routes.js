import {
  createPoll,
  createResponse,
  deleteMyResponse,
  deletePoll,
  getMyResponse,
  getPoll,
  getResults,
  listPolls,
  listResponses,
  updateMyResponse,
  updatePoll,
} from '../controllers/polls.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/events/:eventId/polls', createPoll);
router.get('/events/:eventId/polls', listPolls);
router.get('/polls/:id', getPoll);
router.put('/polls/:id', updatePoll);
router.delete('/polls/:id', deletePoll);

router.post('/polls/:id/responses', createResponse);
router.get('/polls/:id/responses', listResponses);
router.get('/polls/:id/responses/me', getMyResponse);
router.put('/polls/:id/responses/me', updateMyResponse);
router.delete('/polls/:id/responses/me', deleteMyResponse);
router.get('/polls/:id/results', getResults);

export default router;
