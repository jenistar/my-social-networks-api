import {
  addOrganizers,
  addParticipants,
  createEvent,
  deleteEvent,
  getEvent,
  getEventSummary,
  getShareLinks,
  inviteGroupMembers,
  joinEvent,
  listEvents,
  listParticipants,
  removeOrganizer,
  removeParticipant,
  updateEvent,
} from '../controllers/events.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/events', createEvent);
router.get('/events', listEvents);
router.get('/events/:id', getEvent);
router.put('/events/:id', updateEvent);
router.delete('/events/:id', deleteEvent);

router.get('/events/:id/participants', listParticipants);
router.post('/events/:id/participants', addParticipants);
router.delete('/events/:id/participants/:userId', removeParticipant);
router.post('/events/:id/join', joinEvent);
router.post('/events/:id/organizers', addOrganizers);
router.delete('/events/:id/organizers/:userId', removeOrganizer);

router.post('/events/:id/invite-group', inviteGroupMembers);
router.get('/events/:id/share', getShareLinks);
router.get('/events/:id/summary', getEventSummary);

export default router;
