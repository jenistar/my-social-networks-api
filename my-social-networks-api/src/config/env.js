import 'dotenv/config';

// "node --test" définit NODE_TEST_CONTEXT : on passe alors automatiquement en mode test.
const nodeEnv = process.env.NODE_TEST_CONTEXT ? 'test' : process.env.NODE_ENV || 'development';
const isTest = nodeEnv === 'test';

// Le secret JWT ne doit jamais avoir de valeur par défaut hors des tests.
const jwtSecret = process.env.JWT_SECRET || (isTest ? 'secret-reserve-aux-tests-automatiques' : '');
if (!jwtSecret) {
  throw new Error('JWT_SECRET est manquant. Copiez .env.example vers .env puis renseignez un secret long et aléatoire.');
}
if (!isTest && jwtSecret.length < 32) {
  throw new Error('JWT_SECRET est trop court. Utilisez au moins 32 caractères aléatoires.');
}

export const env = {
  nodeEnv,
  isTest,
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/my_social_networks',
  jwtSecret,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  bcryptRounds: isTest ? 4 : Number(process.env.BCRYPT_ROUNDS) || 12,
  corsOrigin: process.env.CORS_ORIGIN || '*',
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  postmanDocUrl: process.env.POSTMAN_DOC_URL || '',
};
