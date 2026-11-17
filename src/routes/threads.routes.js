import {
  createComment,
  deleteComment,
  getComment,
  listComments,
  updateComment,
} from '../controllers/comments.controller.js';
import {
  createMessage,
  createThread,
  deleteMessage,
  deleteThread,
  getMessage,
  getThread,
  listMessages,
  listThreads,
  updateMessage,
  updateThread,
} from '../controllers/threads.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/threads', createThread);
router.get('/threads', listThreads);
router.get('/threads/:id', getThread);
router.put('/threads/:id', updateThread);
router.delete('/threads/:id', deleteThread);

router.get('/threads/:id/messages', listMessages);
router.post('/threads/:id/messages', createMessage);
router.get('/messages/:id', getMessage);
router.put('/messages/:id', updateMessage);
router.delete('/messages/:id', deleteMessage);

router.get('/messages/:id/comments', listComments('Message'));
router.post('/messages/:id/comments', createComment('Message'));

// Les commentaires de messages et de photos se modifient par les mêmes routes.
router.get('/comments/:id', getComment);
router.put('/comments/:id', updateComment);
router.delete('/comments/:id', deleteComment);

export default router;
