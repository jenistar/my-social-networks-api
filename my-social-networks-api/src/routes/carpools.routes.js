import {
  createCarpool,
  deleteCarpool,
  getCarpool,
  listCarpools,
  updateCarpool,
} from '../controllers/carpools.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/events/:eventId/carpools', createCarpool);
router.get('/events/:eventId/carpools', listCarpools);
router.get('/carpools/:id', getCarpool);
router.put('/carpools/:id', updateCarpool);
router.delete('/carpools/:id', deleteCarpool);

export default router;
