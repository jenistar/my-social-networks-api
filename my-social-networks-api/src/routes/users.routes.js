import {
  deleteUser,
  getUser,
  listUserEvents,
  listUserGroups,
  listUsers,
  updateUser,
} from '../controllers/users.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.get('/users', listUsers);
router.get('/users/:id', getUser);
router.put('/users/:id', updateUser);
router.delete('/users/:id', deleteUser);
router.get('/users/:id/events', listUserEvents);
router.get('/users/:id/groups', listUserGroups);

export default router;
