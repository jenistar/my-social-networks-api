import compression from 'compression';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env.js';
import { errorHandler, notFound } from './middlewares/error.js';
import { rejectMongoOperators } from './middlewares/security.js';
import routes from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin }));
  app.use(compression());
  app.use(express.json({ limit: '100kb' }));
  if (!env.isTest) app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(rejectMongoOperators);

  app.get('/', (req, res) => res.redirect('/api'));
  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
