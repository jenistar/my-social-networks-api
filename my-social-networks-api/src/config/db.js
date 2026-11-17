import mongoose from 'mongoose';

// On importe tous les modèles pour que leurs index soient créés au démarrage.
import '../models/index.js';

export async function connectDb(uri) {
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
  // Les index uniques (email, shopping list, billets...) font partie des règles métier.
  // On attend donc qu'ils soient prêts avant d'accepter des requêtes.
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  return mongoose.connection;
}

export async function disconnectDb() {
  await mongoose.disconnect();
}
