import {
  addAdmins,
  addMembers,
  createGroup,
  deleteGroup,
  getGroup,
  joinGroup,
  listGroupEvents,
  listGroupThreads,
  listGroups,
  listMembers,
  removeAdmin,
  removeMember,
  updateGroup,
} from '../controllers/groups.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/groups', createGroup);
router.get('/groups', listGroups);
router.get('/groups/:id', getGroup);
router.put('/groups/:id', updateGroup);
router.delete('/groups/:id', deleteGroup);

router.get('/groups/:id/members', listMembers);
router.post('/groups/:id/members', addMembers);
router.delete('/groups/:id/members/:userId', removeMember);
router.post('/groups/:id/join', joinGroup);
router.post('/groups/:id/admins', addAdmins);
router.delete('/groups/:id/admins/:userId', removeAdmin);

router.get('/groups/:id/events', listGroupEvents);
router.get('/groups/:id/threads', listGroupThreads);

export default router;
