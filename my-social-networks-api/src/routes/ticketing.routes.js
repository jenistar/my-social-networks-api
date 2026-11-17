import {
  createTicketType,
  deleteTicket,
  deleteTicketType,
  getTicket,
  getTicketType,
  listTickets,
  listTicketTypes,
  purchaseTicket,
  updateTicket,
  updateTicketType,
} from '../controllers/ticketing.controller.js';
import { purchaseLimiter } from '../middlewares/security.js';
import { createRouter } from './router.js';

// Routes publiques : une personne extérieure n'a pas de compte (règle 2.7).
export const publicTicketingRoutes = createRouter();
publicTicketingRoutes.get('/events/:eventId/ticket-types', listTicketTypes);
publicTicketingRoutes.get('/ticket-types/:id', getTicketType);
publicTicketingRoutes.post('/events/:eventId/tickets', purchaseLimiter, purchaseTicket);

// Routes réservées aux organisateurs connectés.
const router = createRouter();
router.post('/events/:eventId/ticket-types', createTicketType);
router.put('/ticket-types/:id', updateTicketType);
router.delete('/ticket-types/:id', deleteTicketType);

router.get('/events/:eventId/tickets', listTickets);
router.get('/tickets/:id', getTicket);
router.put('/tickets/:id', updateTicket);
router.delete('/tickets/:id', deleteTicket);

export default router;
