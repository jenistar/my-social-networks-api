// Génère la documentation de l'API :
//   - postman/My_Social_Networks_API.postman_collection.json (collection à importer et à publier dans Postman)
//   - docs/API.md (liste de toutes les routes, lisible directement sur GitHub)
//
// Usage : npm run docs:build
// Il faut une base MongoDB joignable. Le script utilise une base séparée, vidée avant et après.
import { writeFile } from 'node:fs/promises';

process.env.NODE_ENV = 'test'; // Pas de journal des requêtes ni de limite de débit pendant la génération.

const { createApp } = await import('../src/app.js');
const { connectDb, disconnectDb } = await import('../src/config/db.js');
const { default: mongoose } = await import('mongoose');
const { buildCollection } = await import('./postman/build.js');
const { folders, info, variables } = await import('./postman/catalog.js');

const DOCS_URI = process.env.MONGODB_URI_DOCS || 'mongodb://127.0.0.1:27017/my_social_networks_docs';
const COLLECTION_FILE = new URL('../postman/My_Social_Networks_API.postman_collection.json', import.meta.url);
const REFERENCE_FILE = new URL('../docs/API.md', import.meta.url);

const wipe = () => Promise.all(Object.values(mongoose.models).map((model) => model.deleteMany({})));

// Transforme "/events/{{eventId}}/participants/{{otherUserId}}" en "/events/:id/participants/:userId".
function readablePath(path) {
  let index = 0;
  return path.replace(/\{\{[^}]+\}\}/g, () => (index++ === 0 ? ':id' : ':userId'));
}

const firstSentence = (text) => text.split(/(?<=\.)\s/)[0].replace(/\n/g, ' ');

function renderReference(reference, count) {
  const lines = [
    '# Référence de l\'API My Social Networks',
    '',
    'Ce fichier est généré par `npm run docs:build` à partir du même catalogue que la collection Postman.',
    `Il liste les ${count} requêtes documentées. Les exemples complets de requêtes et de réponses sont dans la collection Postman.`,
    '',
    'Toutes les routes commencent par `/api`. Sauf mention "Public", un token JWT est obligatoire (`Authorization: Bearer <token>`).',
    '',
  ];

  for (const folder of reference) {
    lines.push(`## ${folder.name}`, '', folder.description, '', '| Méthode | Route | Rôle | Accès |', '|---|---|---|---|');
    const seen = new Set();
    for (const row of folder.rows) {
      const route = `${row.method} ${readablePath(row.path)}`;
      if (seen.has(route)) continue; // Les variantes d'une même route ne sont listées qu'une fois.
      seen.add(route);
      lines.push(`| \`${row.method}\` | \`${readablePath(row.path)}\` | ${firstSentence(row.summary)} | ${row.access} |`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

await connectDb(DOCS_URI);
await wipe();
const server = createApp().listen(0);

try {
  const { port } = server.address();
  const { collection, reference, count } = await buildCollection({
    baseUrl: `http://127.0.0.1:${port}/api`,
    info,
    variables,
    folders,
  });

  await writeFile(COLLECTION_FILE, `${JSON.stringify(collection, null, 2)}\n`);
  await writeFile(REFERENCE_FILE, renderReference(reference, count));

  const examples = collection.item.flatMap((folder) => folder.item).reduce((sum, item) => sum + item.response.length, 0);
  console.log(`Documentation générée : ${collection.item.length} dossiers, ${count} requêtes, ${examples} exemples de réponses.`);
} finally {
  await wipe();
  server.close();
  await disconnectDb();
}
