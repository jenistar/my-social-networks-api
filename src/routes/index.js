import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { authenticate } from '../middlewares/auth.js';
import albumRoutes from './albums.routes.js';
import authRoutes from './auth.routes.js';
import carpoolRoutes from './carpools.routes.js';
import eventRoutes from './events.routes.js';
import groupRoutes from './groups.routes.js';
import pollRoutes from './polls.routes.js';
import { createRouter } from './router.js';
import shoppingRoutes from './shopping.routes.js';
import threadRoutes from './threads.routes.js';
import ticketingRoutes, { publicTicketingRoutes } from './ticketing.routes.js';
import userRoutes from './users.routes.js';

const router = createRouter();

// ---------- Routes publiques ----------

router.get('/', (req, res) => {
  res.json({
    data: {
      name: 'My Social Networks API',
      version: '2.0.0',
      documentation: env.postmanDocUrl || 'Voir le dossier postman/ et le fichier docs/API.md du dépôt',
      health: '/api/health',
    },
  });
});

router.get('/health', (req, res) => {
  const connected = mongoose.connection.readyState === 1;
  res.status(connected ? 200 : 503).json({
    data: { status: connected ? 'ok' : 'unavailable', database: connected ? 'connected' : 'disconnected', uptime: Math.round(process.uptime()) },
  });
});

router.use('/auth', authRoutes);
router.use(publicTicketingRoutes);

// ---------- Routes protégées : un token JWT valide est obligatoire ----------

router.use(authenticate);
router.use(userRoutes);
router.use(eventRoutes);
router.use(groupRoutes);
router.use(threadRoutes);
router.use(albumRoutes);
router.use(pollRoutes);
router.use(ticketingRoutes);
router.use(shoppingRoutes);
router.use(carpoolRoutes);

export default router;
