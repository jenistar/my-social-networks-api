import { createItem, deleteItem, getItem, listItems, updateItem } from '../controllers/shopping.controller.js';
import { createRouter } from './router.js';

const router = createRouter();

router.post('/events/:eventId/shopping-items', createItem);
router.get('/events/:eventId/shopping-items', listItems);
router.get('/shopping-items/:id', getItem);
router.put('/shopping-items/:id', updateItem);
router.delete('/shopping-items/:id', deleteItem);

export default router;
