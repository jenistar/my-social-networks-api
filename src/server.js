import { createApp } from './app.js';
import { connectDb, disconnectDb } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  await connectDb(env.mongoUri);
  console.log('Connecté à MongoDB');

  const server = createApp().listen(env.port, () => {
    console.log(`My Social Networks API disponible sur http://localhost:${env.port}/api`);
  });

  // Arrêt propre : on termine les requêtes en cours avant de fermer la base.
  const shutdown = (signal) => {
    console.log(`${signal} reçu, arrêt du serveur`);
    server.close(async () => {
      await disconnectDb();
      process.exit(0);
    });
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
  console.error('Impossible de démarrer le serveur :', error.message);
  process.exit(1);
});
