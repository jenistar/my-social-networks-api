// Catalogue de la documentation Postman : dossiers, requêtes, explications fonctionnelles.
// Les réponses d'exemple ne sont pas écrites ici : elles sont enregistrées par scripts/postman/build.js
// en appelant réellement l'API.

// ---------- Outils de rédaction ----------

function doc({ text, access, fields, rules, errors }) {
  const parts = [text, `**Accès :** ${access}`];
  if (fields) {
    parts.push(
      [
        '**Corps de la requête (JSON) :**',
        '',
        '| Champ | Type | Obligatoire | Description |',
        '|---|---|---|---|',
        ...fields.map(([name, type, required, description]) => `| \`${name}\` | ${type} | ${required ? 'Oui' : 'Non'} | ${description} |`),
      ].join('\n'),
    );
  }
  if (rules) parts.push(['**Règles appliquées :**', '', ...rules.map((rule) => `- ${rule}`)].join('\n'));
  if (errors) parts.push(['**Erreurs possibles :**', '', ...errors.map(([code, message]) => `- \`${code}\` : ${message}`)].join('\n'));
  return parts.join('\n\n');
}

// Construit une requête du catalogue. "summary" sert au tableau de docs/API.md.
const request = (name, method, path, expect, { summary, access, ...rest }) => ({
  name,
  method,
  path,
  expect,
  summary: summary ?? rest.text,
  access,
  description: doc({ access, ...rest }),
  ...rest,
});

const PAGE_PARAMS = [
  { key: 'page', value: '1', description: 'Numéro de la page (1 par défaut).', disabled: true },
  { key: 'limit', value: '20', description: 'Nombre de résultats par page (20 par défaut, 100 au maximum).', disabled: true },
];

const ACCESS = {
  public: 'Public. Aucun token nécessaire.',
  user: 'Tout utilisateur connecté.',
  self: 'Utilisateur connecté, sur son propre compte uniquement.',
  viewer: 'Utilisateur connecté qui a le droit de voir l\'événement (événement public, ou personne invitée si l\'événement est privé).',
  member: 'Participants et organisateurs de l\'événement.',
  organizer: 'Organisateurs de l\'événement.',
  groupAdmin: 'Administrateurs du groupe.',
  groupContent: 'Tout utilisateur connecté si le groupe est public. Membres uniquement si le groupe est privé ou secret.',
};

const E = {
  auth: ['401', 'Token manquant, invalide ou expiré.'],
  validation: ['400', 'Données invalides. Le détail de chaque champ est dans `error.details`.'],
  id: ['400', 'Identifiant mal formé.'],
  privateEvent: ['403', 'L\'événement est privé et vous n\'y êtes pas invité.'],
  notOrganizer: ['403', 'Vous n\'êtes pas organisateur de l\'événement.'],
  notMember: ['403', 'Vous n\'êtes ni participant ni organisateur de l\'événement.'],
  notGroupAdmin: ['403', 'Vous n\'êtes pas administrateur du groupe.'],
  eventNotFound: ['404', 'Événement introuvable.'],
  groupNotFound: ['404', 'Groupe introuvable, ou groupe secret dont vous n\'êtes pas membre.'],
};

// Dates d'exemple : un gala le 19 juin 2027.
const GALA_START = '2027-06-19T18:00:00.000Z';
const GALA_END = '2027-06-20T01:00:00.000Z';
const PASSWORD = 'MotDePasse123!';

// ---------- Présentation de la collection ----------

export const info = {
  name: 'My Social Networks API',
  description: `API REST de la refonte **My Social Networks** : utilisateurs, événements, groupes, fils de discussion, albums photo, sondages, billetterie, shopping list et covoiturage.

Version de l'API : **2.0.0**. Technologies : Node.js, Express, MongoDB (Mongoose), authentification JWT.

## Adresse de base

Toutes les routes commencent par \`{{baseUrl}}\`. En local : \`http://localhost:3000/api\`.

## Authentification

1. Créez un compte avec \`POST /auth/register\` ou connectez-vous avec \`POST /auth/login\`.
2. La réponse contient un \`token\` JWT.
3. Envoyez ce token dans l'en-tête de chaque requête : \`Authorization: Bearer <token>\`.

Dans cette collection, le token est enregistré automatiquement dans la variable \`token\` après l'inscription ou la connexion.

Seules ces routes sont publiques : l'inscription, la connexion, les informations générales et la billetterie vue par une personne extérieure (liste des billets en vente et achat d'un billet).

## Format des réponses

- Une ressource : \`{ "data": { ... } }\`
- Une liste : \`{ "data": [ ... ], "meta": { "page": 1, "limit": 20, "total": 42, "totalPages": 3 } }\`
- Une suppression réussie : code \`204\` sans contenu.
- Une erreur : \`{ "error": { "status": 400, "message": "...", "details": { "champ": "..." } } }\`

## Codes HTTP utilisés

| Code | Signification |
|---|---|
| 200 | Succès |
| 201 | Ressource créée |
| 204 | Suppression réussie |
| 400 | Données invalides ou identifiant mal formé |
| 401 | Authentification absente ou invalide |
| 403 | Vous n'avez pas le droit de faire cette action |
| 404 | Ressource introuvable |
| 409 | La demande est valide mais contredit une règle métier (doublon, quantité épuisée, option désactivée...) |
| 429 | Trop de requêtes (connexion, achat de billets) |

## Recherche et pagination (le "S" de CRUDS)

Toutes les listes acceptent \`page\` et \`limit\`. La plupart acceptent aussi \`q\`, une recherche de texte qui ignore les majuscules.

## Rôles

- **Événement** : organisateur ou participant. Un organisateur a aussi tous les droits d'un participant.
- **Groupe** : administrateur ou membre. Un administrateur est toujours membre.
- **Personne extérieure** : sans compte. Elle peut seulement consulter la billetterie d'un événement public et y obtenir un billet.

## Utiliser la collection

Les dossiers sont rangés dans l'ordre du cahier des charges. Les requêtes peuvent être lancées une par une ou toutes à la suite avec le Runner : chaque création enregistre l'identifiant obtenu dans une variable de collection (\`eventId\`, \`groupId\`, \`pollId\`...) qui est réutilisée par les requêtes suivantes.

Deux comptes sont créés dans le dossier Authentification : le compte principal (variable \`token\`) qui organise, et un second compte (variable \`otherToken\`) qui joue le rôle de l'invité.`,
};

export const variables = [
  ['baseUrl', 'http://localhost:3000/api', 'Adresse de base de l\'API.'],
  ['token', '', 'Token JWT du compte principal. Rempli par "Créer un compte" ou "Se connecter".'],
  ['userId', '', 'Identifiant du compte principal.'],
  ['email', '', 'Email du compte principal.'],
  ['otherToken', '', 'Token JWT du second compte (l\'invité).'],
  ['otherUserId', '', 'Identifiant du second compte.'],
  ['tempToken', '', 'Token d\'un compte temporaire, créé pour montrer la suppression de compte.'],
  ['tempUserId', '', 'Identifiant du compte temporaire.'],
  ['eventId', '', 'Événement public utilisé dans toute la collection.'],
  ['privateEventId', '', 'Événement privé, créé puis supprimé dans le dossier Événements.'],
  ['groupId', '', 'Groupe public utilisé dans toute la collection.'],
  ['secretGroupId', '', 'Groupe secret, créé puis supprimé dans le dossier Groupes.'],
  ['groupEventId', '', 'Événement créé dans le groupe.'],
  ['threadId', '', 'Fil de discussion lié à l\'événement.'],
  ['messageId', '', 'Message publié dans le fil.'],
  ['commentId', '', 'Commentaire d\'un message.'],
  ['albumId', '', 'Album photo de l\'événement.'],
  ['photoId', '', 'Photo de l\'album.'],
  ['pollId', '', 'Sondage de l\'événement.'],
  ['question1Id', '', 'Première question du sondage.'],
  ['answer1Id', '', 'Première réponse possible de la question 1.'],
  ['answer1bId', '', 'Deuxième réponse possible de la question 1.'],
  ['question2Id', '', 'Deuxième question du sondage.'],
  ['answer2Id', '', 'Réponse choisie pour la question 2.'],
  ['ticketTypeId', '', 'Type de billet "Tarif normal".'],
  ['vipTicketTypeId', '', 'Type de billet "Tarif VIP".'],
  ['ticketId', '', 'Billet acheté.'],
  ['shoppingItemId', '', 'Élément de la shopping list.'],
  ['carpoolId', '', 'Covoiturage proposé.'],
];

// ---------- Dossiers ----------

const general = {
  name: '0. Informations générales',
  description: 'Routes publiques pour vérifier que l\'API fonctionne. Utiles pour une supervision ou un test de déploiement.',
  requests: [
    request('Informations sur l\'API', 'GET', '/', 200, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Renvoie le nom et la version de l\'API, ainsi que l\'adresse de sa documentation.',
    }),
    request('État de santé', 'GET', '/health', 200, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Indique si l\'API répond et si elle est connectée à la base de données. Renvoie `503` si la base est injoignable.',
    }),
  ],
};

const authentication = {
  name: '1. Authentification',
  description: 'Inscription et connexion. Le mot de passe est haché avec bcrypt et n\'est jamais renvoyé. Le token JWT obtenu est valable 2 heures par défaut.',
  requests: [
    request('Créer un compte', 'POST', '/auth/register', 201, {
      auth: 'none',
      access: ACCESS.public,
      summary: 'Crée un utilisateur et renvoie son token JWT.',
      text: 'Crée un utilisateur. C\'est la création (le "C") du CRUDS des utilisateurs. La réponse contient le profil créé et un token JWT, ce qui évite de se connecter juste après.',
      fields: [
        ['firstName', 'texte', true, 'Prénom (50 caractères au maximum).'],
        ['lastName', 'texte', true, 'Nom (50 caractères au maximum).'],
        ['email', 'texte', true, 'Adresse email. Elle est unique et enregistrée en minuscules.'],
        ['password', 'texte', true, 'Mot de passe de 8 à 72 caractères.'],
        ['birthDate', 'date', false, 'Date de naissance, dans le passé.'],
        ['phone', 'texte', false, 'Numéro de téléphone.'],
        ['city', 'texte', false, 'Ville.'],
        ['bio', 'texte', false, 'Présentation (500 caractères au maximum).'],
        ['avatar', 'URL', false, 'Adresse de la photo de profil (http ou https).'],
      ],
      rules: ['Règle 2.1 : il ne peut pas y avoir deux utilisateurs avec le même email. La comparaison ignore les majuscules.'],
      errors: [E.validation, ['409', 'Cet email est déjà utilisé par un autre compte.']],
      body: {
        firstName: 'Awa',
        lastName: 'Diallo',
        email: 'awa.diallo.{{$timestamp}}@example.com',
        password: PASSWORD,
        birthDate: '1998-04-12',
        phone: '+33612345678',
        city: 'Cergy',
        bio: 'Passionnée de randonnée et de photo.',
        avatar: 'https://i.pravatar.cc/300?img=47',
      },
      save: { token: 'data.token', userId: 'data.user._id', email: 'data.user.email' },
    }),
    request('Créer un second compte', 'POST', '/auth/register', 201, {
      auth: 'none',
      access: ACCESS.public,
      summary: 'Crée le second compte de la collection (l\'invité).',
      text: 'Même route que la précédente. Ce second compte sert d\'invité dans la suite de la collection : il rejoint un événement, commente, répond à un sondage. Son token est enregistré dans la variable `otherToken`.',
      body: {
        firstName: 'Lucas',
        lastName: 'Bernard',
        email: 'lucas.bernard.{{$timestamp}}@example.com',
        password: PASSWORD,
        city: 'Pontoise',
      },
      save: { otherToken: 'data.token', otherUserId: 'data.user._id' },
    }),
    request('Se connecter', 'POST', '/auth/login', 200, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Vérifie l\'email et le mot de passe, puis renvoie le profil et un nouveau token JWT.',
      fields: [
        ['email', 'texte', true, 'Email du compte.'],
        ['password', 'texte', true, 'Mot de passe du compte.'],
      ],
      rules: [
        'Le message d\'erreur est le même pour un email inconnu et pour un mauvais mot de passe. On ne peut donc pas deviner si un compte existe.',
        'Le nombre de tentatives est limité (30 par quart d\'heure et par adresse IP).',
      ],
      errors: [['400', 'Email ou mot de passe absent.'], ['401', 'Email ou mot de passe incorrect.'], ['429', 'Trop de tentatives.']],
      body: { email: '{{email}}', password: PASSWORD },
      save: { token: 'data.token' },
    }),
    request('Mon profil', 'GET', '/auth/me', 200, {
      access: ACCESS.user,
      text: 'Renvoie le profil complet de l\'utilisateur connecté, y compris son email et son téléphone.',
      errors: [E.auth],
    }),
  ],
};

const users = {
  name: '2. Utilisateurs',
  description: `Cahier des charges 2.1. La création d'un utilisateur se fait avec \`POST /auth/register\` (dossier Authentification).

**Attributs d'un utilisateur :** prénom, nom, email (unique), mot de passe (haché), date de naissance, téléphone, ville, présentation, photo de profil, dates de création et de modification.

**Vie privée :** l'email, le téléphone et la date de naissance ne sont visibles que par l'utilisateur lui-même. Les autres ne voient que le profil public (prénom, nom, ville, présentation, photo).`,
  // Données préparées pour que les exemples de ce dossier ne soient pas vides.
  setup: async (call) => {
    await call('POST', '/events', {
      body: { name: 'Tournoi de pétanque', startDate: '2027-05-08T12:00:00.000Z', endDate: '2027-05-08T17:00:00.000Z', location: 'Parc François-Mitterrand, Cergy', visibility: 'public' },
    });
    await call('POST', '/groups', { body: { name: 'Club de lecture de Cergy', description: 'Un livre par mois.', type: 'public' } });
  },
  requests: [
    request('Rechercher des utilisateurs', 'GET', '/users', 200, {
      access: ACCESS.user,
      text: 'Recherche des utilisateurs par prénom, nom ou ville. Sert par exemple à trouver une personne à inviter. Les résultats sont triés par nom.',
      query: [{ key: 'q', value: 'lucas', description: 'Texte recherché dans le prénom, le nom et la ville.' }, ...PAGE_PARAMS],
      rules: ['Seul le profil public est renvoyé. Les emails ne sont jamais exposés.'],
      errors: [E.auth],
    }),
    request('Consulter un profil', 'GET', '/users/{{otherUserId}}', 200, {
      access: ACCESS.user,
      text: 'Renvoie le profil public d\'un utilisateur. Si l\'identifiant est celui de l\'utilisateur connecté, le profil complet est renvoyé.',
      errors: [E.id, E.auth, ['404', 'Utilisateur introuvable.']],
    }),
    request('Modifier son profil', 'PUT', '/users/{{userId}}', 200, {
      access: ACCESS.self,
      text: 'Modifie le profil de l\'utilisateur connecté. Seuls les champs envoyés sont modifiés.',
      fields: [
        ['firstName, lastName, email, birthDate, phone, city, bio, avatar', 'voir "Créer un compte"', false, 'Champs du profil à modifier.'],
        ['password', 'texte', false, 'Nouveau mot de passe.'],
        ['currentPassword', 'texte', false, 'Mot de passe actuel. Obligatoire pour changer de mot de passe.'],
      ],
      rules: ['Un utilisateur ne peut modifier que son propre compte.', 'Le nouvel email ne doit pas appartenir à un autre compte (règle 2.1).'],
      errors: [E.validation, ['400', 'Mot de passe actuel incorrect.'], ['403', 'Ce compte n\'est pas le vôtre.'], ['409', 'Email déjà utilisé.']],
      body: { city: 'Pontoise', bio: 'Passionnée de randonnée, de photo et de cuisine.' },
    }),
    request('Événements d\'un utilisateur', 'GET', '/users/{{userId}}/events', 200, {
      access: ACCESS.user,
      summary: 'Liste les événements d\'un utilisateur, avec son rôle dans chacun.',
      text: 'Endpoint spécifique. Liste les événements qu\'un utilisateur organise ou auxquels il participe, avec son rôle dans chacun (`organizer` ou `participant`).',
      query: PAGE_PARAMS,
      rules: ['Seuls les événements que le demandeur a le droit de voir sont renvoyés : les événements publics, et les événements privés auxquels il est lui-même invité.'],
      errors: [E.id, ['404', 'Utilisateur introuvable.']],
    }),
    request('Groupes d\'un utilisateur', 'GET', '/users/{{userId}}/groups', 200, {
      access: ACCESS.user,
      summary: 'Liste les groupes d\'un utilisateur, avec son rôle dans chacun.',
      text: 'Endpoint spécifique. Liste les groupes dont un utilisateur est membre, avec son rôle dans chacun (`admin` ou `member`).',
      query: PAGE_PARAMS,
      rules: ['Les groupes privés et secrets ne sont renvoyés que si le demandeur en est membre lui aussi.'],
      errors: [E.id, ['404', 'Utilisateur introuvable.']],
    }),
    request('Supprimer son compte', 'DELETE', '/users/{{tempUserId}}', 204, {
      auth: 'temp',
      access: ACCESS.self,
      text: 'Supprime le compte de l\'utilisateur connecté. Il est retiré des événements et des groupes. Ses réponses aux sondages, ses éléments de shopping list et ses covoiturages sont supprimés.\n\nDans cette collection, un script de pré-requête crée d\'abord un compte temporaire, puis c\'est ce compte qui est supprimé. Le compte principal reste ainsi utilisable pour la suite.',
      rules: [
        'Un utilisateur ne peut supprimer que son propre compte.',
        'La suppression est refusée s\'il est le seul organisateur d\'un événement ou le seul administrateur d\'un groupe. Les règles 2.2 et 2.3 (au moins un organisateur, au moins un administrateur) restent ainsi toujours vraies.',
      ],
      errors: [['403', 'Ce compte n\'est pas le vôtre.'], ['409', 'Vous êtes le seul organisateur d\'un événement ou le seul administrateur d\'un groupe.']],
      prerequest: `// Crée un compte temporaire, pour ne pas supprimer le compte principal de la collection.
pm.sendRequest({
  url: pm.collectionVariables.get("baseUrl") + "/auth/register",
  method: "POST",
  header: { "Content-Type": "application/json" },
  body: {
    mode: "raw",
    raw: JSON.stringify({
      firstName: "Compte",
      lastName: "Temporaire",
      email: "temporaire." + Date.now() + "@example.com",
      password: "MotDePasse123!"
    })
  }
}, (error, response) => {
  const data = response.json().data;
  pm.collectionVariables.set("tempUserId", data.user._id);
  pm.collectionVariables.set("tempToken", data.token);
});`,
      setup: async (call, vars) => {
        const { data } = await call('POST', '/auth/register', {
          auth: 'none',
          body: { firstName: 'Compte', lastName: 'Temporaire', email: 'temporaire.{{$timestamp}}@example.com', password: PASSWORD },
        });
        vars.tempUserId = data.user._id;
        vars.tempToken = data.token;
      },
    }),
  ],
};

// Dans les définitions, la clé "errors" liste les erreurs décrites dans le texte de la documentation.
// Les exemples d'erreurs réellement exécutés sont déclarés à part avec examples(),
// puis rattachés à leur requête à la fin du fichier.
const errorExamples = new Map();
const examples = (folder, name, list) => errorExamples.set(`${folder.name}/${name}`, list);

examples(authentication, 'Créer un compte', [
  { name: 'Email déjà utilisé (règle 2.1)', expect: 409, body: { firstName: 'Autre', lastName: 'Personne', email: '{{email}}', password: PASSWORD } },
  { name: 'Données invalides', expect: 400, body: { firstName: 'Awa', email: 'pas-un-email', password: 'court' } },
]);
examples(authentication, 'Se connecter', [
  { name: 'Mot de passe incorrect', expect: 401, body: { email: '{{email}}', password: 'mauvais-mot-de-passe' } },
]);
examples(authentication, 'Mon profil', [{ name: 'Token manquant', expect: 401, auth: 'none' }]);
examples(users, 'Modifier son profil', [
  { name: 'Compte d\'un autre utilisateur', expect: 403, path: '/users/{{otherUserId}}', body: { firstName: 'Pirate' } },
]);
examples(users, 'Supprimer son compte', [
  { name: 'Seul organisateur d\'un événement', expect: 409, auth: 'user', path: '/users/{{userId}}' },
]);

const events = {
  name: '3. Événements',
  description: `Cahier des charges 1.1 et 2.2.

**Étape 1, configuration de l'événement :** nom, description, date de début, date de fin, lieu, photo de couverture, visibilité (public ou privé), organisateurs et participants.

**Règles :**
- Un événement peut avoir une multitude de participants.
- Un événement est géré par 1 ou plusieurs organisateurs. Le dernier organisateur ne peut pas être retiré.
- Un événement **public** est visible par tous. Un événement **privé** n'est accessible qu'aux personnes invitées.
- Par défaut, un événement est privé.

**Options activables sur un événement :** la shopping list (\`shoppingListEnabled\`) et le covoiturage (\`carpoolingEnabled\`). La billetterie est disponible dès qu'un événement public possède un type de billet.

Les événements créés dans un groupe (invitation automatique des membres, partage) sont décrits dans le dossier Groupes.`,
  requests: [
    request('Créer un événement', 'POST', '/events', 201, {
      access: ACCESS.user,
      summary: 'Crée un événement. Le créateur devient organisateur.',
      text: 'Crée un événement avec les informations de l\'étape 1. L\'utilisateur connecté devient automatiquement organisateur.',
      fields: [
        ['name', 'texte', true, 'Titre de l\'événement, tel qu\'il apparaît aux participants.'],
        ['description', 'texte', false, 'Présentation : programme, objectif, informations pratiques.'],
        ['startDate', 'date ISO 8601', true, 'Date et heure de début.'],
        ['endDate', 'date ISO 8601', true, 'Date et heure de fin. Elle ne peut pas être avant le début.'],
        ['location', 'texte', true, 'Adresse ou endroit où se déroule l\'événement.'],
        ['coverPhoto', 'URL', false, 'Photo de couverture (http ou https).'],
        ['visibility', '`public` ou `private`', false, 'Visibilité. `private` par défaut.'],
        ['organizers', 'liste d\'identifiants', false, 'Autres organisateurs. Le créateur est toujours ajouté.'],
        ['participants', 'liste d\'identifiants', false, 'Personnes invitées à l\'événement.'],
        ['group', 'identifiant', false, 'Groupe dans lequel créer l\'événement. Tous ses membres sont alors invités.'],
        ['shoppingListEnabled', 'booléen', false, 'Active la shopping list. `false` par défaut.'],
        ['carpoolingEnabled', 'booléen', false, 'Active le covoiturage. `false` par défaut.'],
      ],
      errors: [E.validation, ['404', 'Un des utilisateurs indiqués n\'existe pas.']],
      body: {
        name: 'Gala de fin d\'année',
        description: 'Remise des diplômes à 18h, dîner à 20h, puis soirée dansante. Tenue de soirée souhaitée.',
        startDate: GALA_START,
        endDate: GALA_END,
        location: 'Salle des fêtes, 12 avenue du Parc, 95000 Cergy',
        coverPhoto: 'https://images.unsplash.com/photo-1511795409834-ef04bbd61622',
        visibility: 'public',
      },
      save: { eventId: 'data._id' },
    }),
    request('Créer un événement privé avec des invités', 'POST', '/events', 201, {
      access: ACCESS.user,
      summary: 'Variante : événement privé avec sa liste d\'invités.',
      text: 'Même route. Cet exemple crée un événement privé et invite directement un participant. Seuls les organisateurs et les personnes invitées pourront le voir.',
      body: {
        name: 'Dîner de l\'équipe d\'organisation',
        description: 'Bilan du gala autour d\'un repas.',
        startDate: '2027-06-26T19:00:00.000Z',
        endDate: '2027-06-26T23:00:00.000Z',
        location: 'Restaurant Le Vexin, 3 place du Marché, 95000 Cergy',
        visibility: 'private',
        participants: ['{{otherUserId}}'],
      },
      save: { privateEventId: 'data._id' },
    }),
    request('Rechercher des événements', 'GET', '/events', 200, {
      access: ACCESS.user,
      text: 'Recherche parmi les événements publics et les événements où l\'utilisateur connecté est organisateur ou participant. Les résultats sont triés par date de début. Chaque résultat indique le nombre de participants et le rôle du demandeur (`myRole`).',
      query: [
        { key: 'q', value: 'gala', description: 'Texte recherché dans le nom, la description et le lieu.' },
        { key: 'visibility', value: 'public', description: '`public` ou `private`.' },
        { key: 'from', value: '2027-06-01T00:00:00.000Z', description: 'Événements qui se terminent après cette date.', disabled: true },
        { key: 'to', value: '2027-06-30T23:59:59.000Z', description: 'Événements qui commencent avant cette date.', disabled: true },
        { key: 'group', value: '{{groupId}}', description: 'Événements créés dans ce groupe.', disabled: true },
        { key: 'role', value: 'organizer', description: '`organizer` ou `participant` : seulement les événements où j\'ai ce rôle.', disabled: true },
        { key: 'mine', value: 'true', description: 'Seulement mes événements (organisés ou rejoints).', disabled: true },
        ...PAGE_PARAMS,
      ],
      rules: ['Un événement privé n\'apparaît jamais dans les résultats d\'une personne qui n\'y est pas invitée.'],
      errors: [['400', 'Date ou identifiant de groupe invalide.']],
    }),
    request('Consulter un événement', 'GET', '/events/{{eventId}}', 200, {
      access: ACCESS.viewer,
      text: 'Renvoie le détail d\'un événement, avec le profil public de ses organisateurs et de ses participants, et son groupe s\'il en a un.',
      errors: [E.id, E.privateEvent, E.eventNotFound],
    }),
    request('Modifier un événement', 'PUT', '/events/{{eventId}}', 200, {
      access: ACCESS.organizer,
      text: 'Modifie les informations d\'un événement. Seuls les champs envoyés sont modifiés. Cet exemple active la shopping list et le covoiturage, utilisés plus loin dans la collection.',
      fields: [['name, description, startDate, endDate, location, coverPhoto, visibility, shoppingListEnabled, carpoolingEnabled', 'voir "Créer un événement"', false, 'Champs à modifier.']],
      rules: [
        'Les organisateurs et les participants se gèrent avec les routes dédiées ci-dessous.',
        'Un événement qui possède une billetterie doit rester public (règle 2.7).',
      ],
      errors: [E.validation, E.notOrganizer, E.eventNotFound, ['409', 'L\'événement a une billetterie et ne peut pas devenir privé.']],
      body: {
        description: 'Remise des diplômes à 18h, dîner à 20h, puis soirée dansante jusqu\'à 3h. Tenue de soirée souhaitée.',
        shoppingListEnabled: true,
        carpoolingEnabled: true,
      },
    }),
    request('Lister les organisateurs et les participants', 'GET', '/events/{{eventId}}/participants', 200, {
      access: ACCESS.viewer,
      text: 'Endpoint spécifique. Renvoie les deux listes de personnes de l\'événement (organisateurs et participants) avec leur profil public, et le nombre de personnes dans chaque liste.',
      errors: [E.privateEvent, E.eventNotFound],
    }),
    request('Rejoindre un événement public', 'POST', '/events/{{eventId}}/join', 200, {
      auth: 'other',
      access: ACCESS.user,
      text: 'L\'utilisateur connecté s\'inscrit lui-même à un événement public. Dans cette collection, la requête est envoyée par le second compte.',
      rules: ['Seuls les événements publics peuvent être rejoints librement. Pour un événement privé, un organisateur doit inviter la personne.'],
      errors: [['403', 'L\'événement est privé.'], E.eventNotFound],
    }),
    request('Retirer un participant', 'DELETE', '/events/{{eventId}}/participants/{{otherUserId}}', 204, {
      access: 'Organisateurs de l\'événement, ou le participant lui-même pour se désinscrire.',
      text: 'Retire une personne de la liste des participants.',
      errors: [['403', 'Vous n\'êtes ni organisateur ni la personne concernée.'], ['404', 'Cette personne ne participe pas à l\'événement.'], ['409', 'Cette personne est organisatrice. Retirez d\'abord son rôle.']],
    }),
    request('Inviter des participants', 'POST', '/events/{{eventId}}/participants', 200, {
      access: ACCESS.organizer,
      text: 'Un organisateur ajoute un ou plusieurs utilisateurs à la liste des participants. C\'est la seule façon d\'entrer dans un événement privé.',
      fields: [
        ['userId', 'identifiant', false, 'Utilisateur à inviter.'],
        ['userIds', 'liste d\'identifiants', false, 'Plusieurs utilisateurs à inviter en une fois.'],
      ],
      rules: ['Il faut envoyer `userId` ou `userIds`.', 'Inviter une personne déjà présente ne crée pas de doublon.'],
      errors: [E.notOrganizer, ['404', 'Un des utilisateurs n\'existe pas.']],
      body: { userId: '{{otherUserId}}' },
    }),
    request('Nommer un organisateur', 'POST', '/events/{{eventId}}/organizers', 200, {
      access: ACCESS.organizer,
      text: 'Donne le rôle d\'organisateur à un ou plusieurs utilisateurs. Un participant qui devient organisateur quitte la liste des participants.',
      fields: [
        ['userId', 'identifiant', false, 'Utilisateur à nommer.'],
        ['userIds', 'liste d\'identifiants', false, 'Plusieurs utilisateurs à nommer en une fois.'],
      ],
      errors: [E.notOrganizer, ['404', 'Un des utilisateurs n\'existe pas.']],
      body: { userId: '{{otherUserId}}' },
    }),
    request('Retirer un organisateur', 'DELETE', '/events/{{eventId}}/organizers/{{otherUserId}}', 200, {
      access: ACCESS.organizer,
      text: 'Retire le rôle d\'organisateur à une personne. Elle reste participante de l\'événement.',
      rules: ['Règle 2.2 : un événement est géré par au moins 1 organisateur. Le dernier organisateur ne peut pas être retiré.'],
      errors: [E.notOrganizer, ['404', 'Cette personne n\'est pas organisatrice.'], ['409', 'C\'est le dernier organisateur de l\'événement.']],
    }),
    request('Résumé d\'un événement', 'GET', '/events/{{eventId}}/summary', 200, {
      access: ACCESS.viewer,
      text: 'Endpoint spécifique. Renvoie en une seule requête le tableau de bord de l\'événement : rôle du demandeur, nombre de participants, de fils de discussion, d\'albums, de photos et de sondages, état de la billetterie, de la shopping list et du covoiturage.',
      errors: [E.privateEvent, E.eventNotFound],
    }),
    request('Supprimer un événement', 'DELETE', '/events/{{privateEventId}}', 204, {
      access: ACCESS.organizer,
      text: 'Supprime un événement et tout ce qui en dépend : fils de discussion, messages, commentaires, albums, photos, sondages, réponses, types de billets, billets, shopping list et covoiturages. Dans cette collection, c\'est l\'événement privé qui est supprimé.',
      errors: [E.notOrganizer, E.eventNotFound],
    }),
  ],
};

examples(events, 'Créer un événement', [
  {
    name: 'Date de fin avant la date de début',
    expect: 400,
    body: { name: 'Gala de fin d\'année', startDate: GALA_END, endDate: GALA_START, location: 'Cergy' },
  },
  { name: 'Champs obligatoires manquants', expect: 400, body: { description: 'Un événement sans nom, sans dates et sans lieu.' } },
]);
examples(events, 'Consulter un événement', [{ name: 'Événement introuvable', expect: 404, path: '/events/64b000000000000000000000' }]);
examples(events, 'Modifier un événement', [
  { name: 'Réservé aux organisateurs', expect: 403, auth: 'other', body: { name: 'Nom modifié par un invité' } },
]);
examples(events, 'Retirer un organisateur', [
  { name: 'Dernier organisateur (règle 2.2)', expect: 409, path: '/events/{{eventId}}/organizers/{{userId}}' },
]);
examples(events, 'Supprimer un événement', [{ name: 'Réservé aux organisateurs', expect: 403, auth: 'other', path: '/events/{{eventId}}' }]);

const groups = {
  name: '4. Groupes',
  description: `Cahier des charges 1.2 et 2.3.

**Paramètres d'un groupe :** nom, description, icône, photo de couverture, type (public, privé ou secret), autorisation pour les membres de publier (\`allowMembersToPost\`), autorisation pour les membres de créer des événements (\`allowMembersToCreateEvents\`).

**Types de groupe :**

| Type | Qui peut trouver le groupe | Qui voit les membres et le contenu | Comment entrer |
|---|---|---|---|
| \`public\` | Tout le monde | Tout le monde | Librement, ou ajouté par un administrateur |
| \`private\` | Tout le monde | Les membres | Ajouté par un administrateur |
| \`secret\` | Les membres | Les membres | Ajouté par un administrateur |

**Règles :**
- Un groupe possède 1 ou plusieurs membres et est géré par 1 ou plusieurs administrateurs.
- Un administrateur est toujours membre. Le dernier administrateur ne peut pas être retiré.
- Un fil de discussion est créé automatiquement avec chaque groupe.
- Un événement créé dans un groupe invite automatiquement tous ses membres.
- Dans un groupe public, les organisateurs peuvent partager leurs événements sur les autres réseaux sociaux.`,
  requests: [
    request('Créer un groupe', 'POST', '/groups', 201, {
      access: ACCESS.user,
      summary: 'Crée un groupe. Le créateur devient administrateur.',
      text: 'Crée un groupe. L\'utilisateur connecté devient administrateur et membre. Un fil de discussion "Discussion générale" est créé en même temps.',
      fields: [
        ['name', 'texte', true, 'Nom du groupe.'],
        ['description', 'texte', false, 'Description du groupe.'],
        ['icon', 'URL', false, 'Icône du groupe.'],
        ['coverPhoto', 'URL', false, 'Photo de couverture.'],
        ['type', '`public`, `private` ou `secret`', false, 'Type de groupe. `private` par défaut.'],
        ['allowMembersToPost', 'booléen', false, 'Autorise les membres à publier dans le groupe. `true` par défaut.'],
        ['allowMembersToCreateEvents', 'booléen', false, 'Autorise les membres à créer des événements dans le groupe. `false` par défaut.'],
        ['members', 'liste d\'identifiants', false, 'Membres à ajouter dès la création.'],
        ['admins', 'liste d\'identifiants', false, 'Autres administrateurs.'],
      ],
      errors: [E.validation, ['404', 'Un des utilisateurs indiqués n\'existe pas.']],
      body: {
        name: 'Les randonneurs du Vexin',
        description: 'Sorties à pied le dimanche matin, tous niveaux.',
        icon: 'https://cdn-icons-png.flaticon.com/512/71/71423.png',
        coverPhoto: 'https://images.unsplash.com/photo-1551632811-561732d1e306',
        type: 'public',
        allowMembersToPost: true,
        allowMembersToCreateEvents: false,
      },
      save: { groupId: 'data._id' },
    }),
    request('Créer un groupe secret', 'POST', '/groups', 201, {
      access: ACCESS.user,
      summary: 'Variante : groupe secret.',
      text: 'Même route. Cet exemple crée un groupe secret. Seuls ses membres peuvent le trouver : pour les autres utilisateurs, il n\'apparaît dans aucune recherche et sa consultation renvoie une erreur 404.',
      body: {
        name: 'Comité d\'organisation du gala',
        description: 'Préparation du gala, budget et prestataires.',
        type: 'secret',
        allowMembersToCreateEvents: true,
      },
      save: { secretGroupId: 'data._id' },
    }),
    request('Rechercher des groupes', 'GET', '/groups', 200, {
      access: ACCESS.user,
      text: 'Recherche des groupes par nom ou description. Chaque résultat indique le nombre de membres et le rôle du demandeur (`myRole`).',
      query: [
        { key: 'q', value: 'randonneurs', description: 'Texte recherché dans le nom et la description.' },
        { key: 'type', value: 'public', description: '`public`, `private` ou `secret`.', disabled: true },
        { key: 'mine', value: 'true', description: 'Seulement les groupes dont je suis membre.', disabled: true },
        ...PAGE_PARAMS,
      ],
      rules: ['Un groupe secret n\'apparaît que dans les résultats de ses membres.'],
    }),
    request('Consulter un groupe', 'GET', '/groups/{{groupId}}', 200, {
      access: 'Tout utilisateur connecté pour un groupe public ou privé. Membres uniquement pour un groupe secret.',
      text: 'Renvoie les paramètres du groupe, le nombre de membres et le rôle du demandeur. La liste des membres et des administrateurs est incluse si le demandeur a le droit de la voir.',
      rules: ['Pour un groupe privé, une personne extérieure voit les paramètres et le nombre de membres, mais pas la liste des membres.'],
      errors: [E.id, E.groupNotFound],
    }),
    request('Modifier un groupe', 'PUT', '/groups/{{groupId}}', 200, {
      access: ACCESS.groupAdmin,
      text: 'Modifie les paramètres du groupe. Seuls les champs envoyés sont modifiés.',
      fields: [['name, description, icon, coverPhoto, type, allowMembersToPost, allowMembersToCreateEvents', 'voir "Créer un groupe"', false, 'Paramètres à modifier.']],
      errors: [E.validation, E.notGroupAdmin, E.groupNotFound],
      body: { description: 'Sorties à pied le dimanche matin, tous niveaux. Départ à 9h.', allowMembersToCreateEvents: true },
    }),
    request('Lister les administrateurs et les membres', 'GET', '/groups/{{groupId}}/members', 200, {
      access: ACCESS.groupContent,
      text: 'Endpoint spécifique. Renvoie les administrateurs et les membres du groupe avec leur profil public, et le nombre de personnes dans chaque liste.',
      errors: [['403', 'Le contenu du groupe est réservé à ses membres.'], E.groupNotFound],
    }),
    request('Rejoindre un groupe public', 'POST', '/groups/{{groupId}}/join', 200, {
      auth: 'other',
      access: ACCESS.user,
      text: 'L\'utilisateur connecté devient membre d\'un groupe public. Dans cette collection, la requête est envoyée par le second compte.',
      errors: [['403', 'Le groupe n\'est pas public. Un administrateur doit vous ajouter.'], E.groupNotFound],
    }),
    request('Retirer un membre', 'DELETE', '/groups/{{groupId}}/members/{{otherUserId}}', 204, {
      access: 'Administrateurs du groupe, ou le membre lui-même pour quitter le groupe.',
      text: 'Retire une personne du groupe. Si elle était administratrice, elle perd aussi ce rôle.',
      rules: ['Règle 2.3 : le dernier administrateur ne peut pas quitter le groupe.'],
      errors: [['403', 'Vous n\'êtes ni administrateur ni la personne concernée.'], ['404', 'Cette personne n\'est pas membre du groupe.'], ['409', 'C\'est le dernier administrateur du groupe.']],
    }),
    request('Ajouter des membres', 'POST', '/groups/{{groupId}}/members', 200, {
      access: ACCESS.groupAdmin,
      text: 'Un administrateur ajoute un ou plusieurs utilisateurs au groupe. C\'est la seule façon d\'entrer dans un groupe privé ou secret.',
      fields: [
        ['userId', 'identifiant', false, 'Utilisateur à ajouter.'],
        ['userIds', 'liste d\'identifiants', false, 'Plusieurs utilisateurs à ajouter en une fois.'],
      ],
      errors: [E.notGroupAdmin, ['404', 'Un des utilisateurs n\'existe pas.']],
      body: { userId: '{{otherUserId}}' },
    }),
    request('Nommer un administrateur', 'POST', '/groups/{{groupId}}/admins', 200, {
      access: ACCESS.groupAdmin,
      text: 'Donne le rôle d\'administrateur à un ou plusieurs utilisateurs. Ils deviennent membres s\'ils ne l\'étaient pas.',
      fields: [
        ['userId', 'identifiant', false, 'Utilisateur à nommer.'],
        ['userIds', 'liste d\'identifiants', false, 'Plusieurs utilisateurs à nommer en une fois.'],
      ],
      errors: [E.notGroupAdmin, ['404', 'Un des utilisateurs n\'existe pas.']],
      body: { userId: '{{otherUserId}}' },
    }),
    request('Retirer un administrateur', 'DELETE', '/groups/{{groupId}}/admins/{{otherUserId}}', 200, {
      access: ACCESS.groupAdmin,
      text: 'Retire le rôle d\'administrateur à une personne. Elle reste membre du groupe.',
      rules: ['Règle 2.3 : un groupe est géré par au moins 1 administrateur.'],
      errors: [E.notGroupAdmin, ['404', 'Cette personne n\'est pas administratrice.'], ['409', 'C\'est le dernier administrateur du groupe.']],
    }),
    request('Créer un événement dans le groupe', 'POST', '/events', 201, {
      access: 'Administrateurs du groupe. Membres aussi si le groupe l\'autorise (`allowMembersToCreateEvents`).',
      summary: 'Crée un événement dans un groupe et invite tous ses membres.',
      text: 'Crée un événement rattaché à un groupe, grâce au champ `group`. Tous les membres du groupe sont invités automatiquement : ils apparaissent dans `participants` sans autre action.',
      rules: [
        'Cahier des charges 1.2 : la création d\'événements dans un groupe invite tous les membres en un clic.',
        'Si le groupe n\'autorise pas ses membres à créer des événements, seuls les administrateurs le peuvent.',
      ],
      errors: [['403', 'Vous n\'êtes pas membre du groupe, ou le groupe réserve la création d\'événements aux administrateurs.'], E.groupNotFound],
      body: {
        name: 'Randonnée des crêtes du Vexin',
        description: 'Boucle de 14 km. Prévoir de l\'eau et un pique-nique.',
        startDate: '2027-05-23T07:00:00.000Z',
        endDate: '2027-05-23T13:00:00.000Z',
        location: 'Parking de l\'église, 95450 Théméricourt',
        visibility: 'private',
        group: '{{groupId}}',
      },
      save: { groupEventId: 'data._id' },
    }),
    request('Lister les événements du groupe', 'GET', '/groups/{{groupId}}/events', 200, {
      access: ACCESS.groupContent,
      text: 'Endpoint spécifique. Liste les événements créés dans le groupe que le demandeur a le droit de voir, triés par date de début.',
      query: PAGE_PARAMS,
      errors: [['403', 'Le contenu du groupe est réservé à ses membres.'], E.groupNotFound],
    }),
    request('Inviter tous les membres du groupe', 'POST', '/events/{{groupEventId}}/invite-group', 200, {
      access: ACCESS.organizer,
      text: 'Invite en une seule action tous les membres actuels du groupe à l\'événement. Utile pour les personnes entrées dans le groupe après la création de l\'événement. `meta.invitedCount` indique combien de personnes ont été ajoutées.',
      errors: [E.notOrganizer, ['409', 'L\'événement n\'a pas été créé dans un groupe.']],
    }),
    request('Partager un événement sur les autres réseaux', 'GET', '/events/{{groupEventId}}/share', 200, {
      access: ACCESS.organizer,
      text: 'Endpoint spécifique. Renvoie l\'adresse de l\'événement, un texte de présentation et des liens de partage prêts à l\'emploi (X, LinkedIn, WhatsApp, Telegram, email).',
      rules: ['Cahier des charges 1.2 : le partage sur les autres réseaux sociaux est proposé aux organisateurs des événements d\'un groupe public.'],
      errors: [E.notOrganizer, ['409', 'L\'événement n\'appartient pas à un groupe public.']],
    }),
    request('Lister les fils de discussion du groupe', 'GET', '/groups/{{groupId}}/threads', 200, {
      access: ACCESS.groupContent,
      text: 'Endpoint spécifique. Liste les fils de discussion du groupe. Le premier est le fil "Discussion générale" créé avec le groupe.',
      query: PAGE_PARAMS,
      errors: [['403', 'Le contenu du groupe est réservé à ses membres.'], E.groupNotFound],
    }),
    request('Supprimer un groupe', 'DELETE', '/groups/{{secretGroupId}}', 204, {
      access: ACCESS.groupAdmin,
      text: 'Supprime un groupe avec ses fils de discussion, leurs messages et leurs commentaires. Les événements du groupe sont conservés mais ne sont plus rattachés à un groupe. Dans cette collection, c\'est le groupe secret qui est supprimé.',
      errors: [E.notGroupAdmin, E.groupNotFound],
    }),
  ],
};

examples(groups, 'Créer un groupe', [{ name: 'Type de groupe invalide', expect: 400, body: { name: 'Groupe de test', type: 'ouvert' } }]);
examples(groups, 'Consulter un groupe', [
  { name: 'Groupe secret vu par un non-membre', expect: 404, auth: 'other', path: '/groups/{{secretGroupId}}' },
]);
examples(groups, 'Retirer un administrateur', [
  { name: 'Dernier administrateur (règle 2.3)', expect: 409, path: '/groups/{{groupId}}/admins/{{userId}}' },
]);
examples(groups, 'Partager un événement sur les autres réseaux', [
  { name: 'Événement hors d\'un groupe public', expect: 409, path: '/events/{{eventId}}/share' },
]);

const threads = {
  name: '5. Fils de discussion',
  description: `Cahier des charges 2.4.

**Règles :**
- Un fil de discussion est lié à 1 groupe ou à 1 événement, mais pas aux deux.
- Un fil contient 0 ou plusieurs messages, écrits par un membre, un administrateur, un participant ou un organisateur.
- Chaque membre ou participant peut commenter un message.

**Qui peut faire quoi :**

| Action | Fil d'un groupe | Fil d'un événement |
|---|---|---|
| Lire | Tout le monde si le groupe est public, sinon les membres | Les personnes qui voient l'événement |
| Publier un message | Les administrateurs. Les membres aussi si le groupe l'autorise | Participants et organisateurs |
| Commenter | Tous les membres | Participants et organisateurs |
| Créer, renommer, supprimer un fil | Administrateurs | Organisateurs |

Chaque groupe garde toujours au moins un fil de discussion.`,
  requests: [
    request('Créer un fil pour un événement', 'POST', '/threads', 201, {
      access: 'Organisateurs de l\'événement, ou administrateurs du groupe.',
      summary: 'Crée un fil de discussion lié à un événement ou à un groupe.',
      text: 'Crée un fil de discussion. Il faut indiquer soit `event`, soit `group`.',
      fields: [
        ['title', 'texte', true, 'Titre du fil.'],
        ['event', 'identifiant', false, 'Événement auquel le fil est lié.'],
        ['group', 'identifiant', false, 'Groupe auquel le fil est lié.'],
      ],
      rules: ['Règle 2.4 : un fil est lié à 1 groupe ou à 1 événement, mais pas aux deux. Envoyer les deux champs, ou aucun, renvoie une erreur 400.'],
      errors: [['400', 'Les deux champs `group` et `event` sont présents, ou aucun des deux.'], ['403', 'Vous n\'êtes pas responsable de cet événement ou de ce groupe.']],
      body: { title: 'Questions pratiques', event: '{{eventId}}' },
      save: { threadId: 'data._id' },
    }),
    request('Créer un fil pour un groupe', 'POST', '/threads', 201, {
      access: ACCESS.groupAdmin,
      summary: 'Variante : fil de discussion lié à un groupe.',
      text: 'Même route, avec le champ `group`. Le fil s\'ajoute au fil "Discussion générale" créé avec le groupe.',
      body: { title: 'Covoiturage pour les sorties', group: '{{groupId}}' },
    }),
    request('Rechercher des fils de discussion', 'GET', '/threads', 200, {
      access: ACCESS.user,
      text: 'Liste les fils d\'un événement ou d\'un groupe. Sans filtre, renvoie les fils de tous les groupes et événements de l\'utilisateur connecté.',
      query: [
        { key: 'event', value: '{{eventId}}', description: 'Fils de cet événement.' },
        { key: 'group', value: '{{groupId}}', description: 'Fils de ce groupe. Ne pas combiner avec `event`.', disabled: true },
        { key: 'q', value: 'questions', description: 'Texte recherché dans le titre.', disabled: true },
        ...PAGE_PARAMS,
      ],
      errors: [['400', 'Les filtres `group` et `event` sont utilisés ensemble.'], ['403', 'Vous n\'avez pas accès à ce groupe ou à cet événement.']],
    }),
    request('Consulter un fil', 'GET', '/threads/{{threadId}}', 200, {
      access: 'Utilisateur connecté qui a le droit de lire le fil.',
      text: 'Renvoie le fil, son nombre de messages et les droits du demandeur sur ce fil (`permissions`) : lire, publier, commenter, gérer.',
      errors: [['403', 'Vous n\'avez pas accès à ce fil.'], ['404', 'Fil introuvable.']],
    }),
    request('Renommer un fil', 'PUT', '/threads/{{threadId}}', 200, {
      access: 'Organisateurs de l\'événement, ou administrateurs du groupe.',
      text: 'Modifie le titre du fil. Le rattachement à l\'événement ou au groupe ne peut pas être modifié.',
      fields: [['title', 'texte', false, 'Nouveau titre.']],
      errors: [E.validation, ['403', 'Vous n\'êtes pas responsable de ce fil.']],
      body: { title: 'Questions pratiques sur le gala' },
    }),
    request('Publier un message', 'POST', '/threads/{{threadId}}/messages', 201, {
      access: 'Participants et organisateurs (fil d\'événement). Administrateurs, et membres si le groupe l\'autorise (fil de groupe).',
      text: 'Publie un message dans le fil. L\'auteur est l\'utilisateur connecté.',
      fields: [['content', 'texte', true, 'Contenu du message (5000 caractères au maximum).']],
      rules: ['Dans un groupe, le paramètre `allowMembersToPost` décide si les simples membres peuvent publier.'],
      errors: [E.validation, ['403', 'Vous n\'avez pas le droit de publier dans ce fil.']],
      body: { content: 'Bonsoir à tous. Le parking de la salle est gratuit et ouvert dès 17h30.' },
      save: { messageId: 'data._id' },
    }),
    request('Lister les messages d\'un fil', 'GET', '/threads/{{threadId}}/messages', 200, {
      access: 'Utilisateur connecté qui a le droit de lire le fil.',
      text: 'Liste les messages du fil, du plus récent au plus ancien, avec le profil public de leur auteur.',
      query: [{ key: 'q', value: 'parking', description: 'Texte recherché dans le contenu des messages.', disabled: true }, ...PAGE_PARAMS],
      errors: [['403', 'Vous n\'avez pas accès à ce fil.']],
    }),
    request('Consulter un message', 'GET', '/messages/{{messageId}}', 200, {
      access: 'Utilisateur connecté qui a le droit de lire le fil.',
      text: 'Renvoie un message avec le profil public de son auteur.',
      errors: [['403', 'Vous n\'avez pas accès à ce fil.'], ['404', 'Message introuvable.']],
    }),
    request('Modifier un message', 'PUT', '/messages/{{messageId}}', 200, {
      access: 'Auteur du message.',
      text: 'Modifie le contenu d\'un message.',
      fields: [['content', 'texte', false, 'Nouveau contenu.']],
      errors: [E.validation, ['403', 'Vous n\'êtes pas l\'auteur du message.']],
      body: { content: 'Bonsoir à tous. Le parking de la salle est gratuit et ouvert dès 17h. Entrée par l\'avenue du Parc.' },
    }),
    request('Commenter un message', 'POST', '/messages/{{messageId}}/comments', 201, {
      auth: 'other',
      access: 'Membres du groupe, ou participants et organisateurs de l\'événement.',
      text: 'Ajoute un commentaire sous un message. Dans cette collection, la requête est envoyée par le second compte, qui participe à l\'événement.',
      fields: [['content', 'texte', true, 'Contenu du commentaire (2000 caractères au maximum).']],
      rules: ['Règle 2.4 : chaque membre ou participant peut commenter un message. Ce droit ne dépend pas du paramètre `allowMembersToPost`.'],
      errors: [E.validation, ['403', 'Vous n\'êtes ni membre du groupe ni participant de l\'événement.']],
      body: { content: 'Merci pour l\'information. Y a-t-il des places pour les personnes à mobilité réduite ?' },
      save: { commentId: 'data._id' },
    }),
    request('Lister les commentaires d\'un message', 'GET', '/messages/{{messageId}}/comments', 200, {
      access: 'Utilisateur connecté qui a le droit de lire le fil.',
      text: 'Liste les commentaires d\'un message, du plus ancien au plus récent, avec le profil public de leur auteur.',
      query: PAGE_PARAMS,
    }),
    request('Consulter un commentaire', 'GET', '/comments/{{commentId}}', 200, {
      access: 'Utilisateur connecté qui a le droit de lire le message ou la photo commentée.',
      text: 'Renvoie un commentaire. Cette route fonctionne pour les commentaires de messages et pour les commentaires de photos.',
      errors: [['404', 'Commentaire introuvable.']],
    }),
    request('Modifier un commentaire', 'PUT', '/comments/{{commentId}}', 200, {
      auth: 'other',
      access: 'Auteur du commentaire.',
      text: 'Modifie le contenu d\'un commentaire de message ou de photo.',
      fields: [['content', 'texte', false, 'Nouveau contenu.']],
      errors: [E.validation, ['403', 'Vous n\'êtes pas l\'auteur du commentaire.']],
      body: { content: 'Merci pour l\'information. Y a-t-il des places réservées aux personnes à mobilité réduite près de l\'entrée ?' },
    }),
    request('Supprimer un commentaire', 'DELETE', '/comments/{{commentId}}', 204, {
      auth: 'other',
      access: 'Auteur du commentaire, administrateurs du groupe ou organisateurs de l\'événement.',
      text: 'Supprime un commentaire de message ou de photo.',
      errors: [['403', 'Vous n\'êtes ni l\'auteur ni un responsable.']],
    }),
    request('Supprimer un message', 'DELETE', '/messages/{{messageId}}', 204, {
      access: 'Auteur du message, administrateurs du groupe ou organisateurs de l\'événement.',
      text: 'Supprime un message et ses commentaires.',
      errors: [['403', 'Vous n\'êtes ni l\'auteur ni un responsable.']],
    }),
    request('Supprimer un fil', 'DELETE', '/threads/{{threadId}}', 204, {
      access: 'Organisateurs de l\'événement, ou administrateurs du groupe.',
      text: 'Supprime un fil, ses messages et leurs commentaires.',
      rules: ['Un groupe garde toujours au moins un fil de discussion : son dernier fil ne peut pas être supprimé.'],
      errors: [['403', 'Vous n\'êtes pas responsable de ce fil.'], ['409', 'C\'est le dernier fil de discussion du groupe.']],
    }),
  ],
};

examples(threads, 'Créer un fil pour un événement', [
  { name: 'Fil lié à un groupe et à un événement (règle 2.4)', expect: 400, body: { title: 'Fil impossible', group: '{{groupId}}', event: '{{eventId}}' } },
  { name: 'Réservé aux organisateurs', expect: 403, auth: 'other' },
]);
examples(threads, 'Modifier un message', [{ name: 'Réservé à l\'auteur', expect: 403, auth: 'other', body: { content: 'Message modifié par un autre' } }]);

const albums = {
  name: '6. Albums photo',
  description: `Cahier des charges 2.5.

**Règles :**
- Un album photo est associé à 1 événement.
- Un album contient 0 ou plusieurs photos. Chaque photo est postée par 1 participant de l'événement (ou un organisateur).
- Les photos peuvent être commentées par les participants de l'événement.

Une photo est enregistrée par son adresse (URL). Les commentaires de photos se modifient et se suppriment avec les routes \`/comments/:id\` du dossier Fils de discussion.`,
  requests: [
    request('Créer un album', 'POST', '/events/{{eventId}}/albums', 201, {
      access: ACCESS.member,
      text: 'Crée un album photo dans un événement.',
      fields: [
        ['name', 'texte', true, 'Nom de l\'album.'],
        ['description', 'texte', false, 'Description de l\'album.'],
      ],
      rules: ['Règle 2.5 : un album est associé à 1 événement. L\'événement est celui de l\'URL et ne peut pas être modifié ensuite.'],
      errors: [E.validation, E.notMember, E.eventNotFound],
      body: { name: 'Photos de la soirée', description: 'Les plus belles photos du gala.' },
      save: { albumId: 'data._id' },
    }),
    request('Lister les albums d\'un événement', 'GET', '/events/{{eventId}}/albums', 200, {
      access: ACCESS.viewer,
      text: 'Liste les albums d\'un événement, du plus récent au plus ancien.',
      query: [{ key: 'q', value: 'soirée', description: 'Texte recherché dans le nom et la description.', disabled: true }, ...PAGE_PARAMS],
      errors: [E.privateEvent, E.eventNotFound],
    }),
    request('Consulter un album', 'GET', '/albums/{{albumId}}', 200, {
      access: ACCESS.viewer,
      text: 'Renvoie un album et son nombre de photos.',
      errors: [E.privateEvent, ['404', 'Album introuvable.']],
    }),
    request('Modifier un album', 'PUT', '/albums/{{albumId}}', 200, {
      access: 'Créateur de l\'album ou organisateurs de l\'événement.',
      text: 'Modifie le nom ou la description d\'un album.',
      fields: [['name, description', 'texte', false, 'Champs à modifier.']],
      errors: [E.validation, ['403', 'Vous n\'êtes ni le créateur de l\'album ni un organisateur.']],
      body: { name: 'Photos officielles du gala' },
    }),
    request('Ajouter une photo', 'POST', '/albums/{{albumId}}/photos', 201, {
      auth: 'other',
      access: ACCESS.member,
      text: 'Ajoute une photo dans un album. L\'auteur est l\'utilisateur connecté. Dans cette collection, la photo est postée par le second compte, qui participe à l\'événement.',
      fields: [
        ['url', 'URL', true, 'Adresse de la photo (http ou https).'],
        ['caption', 'texte', false, 'Légende de la photo (500 caractères au maximum).'],
      ],
      rules: ['Règle 2.5 : une photo est postée par 1 participant de l\'événement. Une personne qui ne participe pas reçoit une erreur 403.'],
      errors: [E.validation, E.notMember, ['404', 'Album introuvable.']],
      body: { url: 'https://images.unsplash.com/photo-1519671482749-fd09be7ccebf', caption: 'L\'arrivée des invités' },
      save: { photoId: 'data._id' },
    }),
    request('Lister les photos d\'un album', 'GET', '/albums/{{albumId}}/photos', 200, {
      access: ACCESS.viewer,
      text: 'Liste les photos d\'un album, de la plus récente à la plus ancienne, avec le profil public de leur auteur.',
      query: [{ key: 'q', value: 'invités', description: 'Texte recherché dans la légende.', disabled: true }, ...PAGE_PARAMS],
    }),
    request('Consulter une photo', 'GET', '/photos/{{photoId}}', 200, {
      access: ACCESS.viewer,
      text: 'Renvoie une photo avec le profil public de son auteur.',
      errors: [E.privateEvent, ['404', 'Photo introuvable.']],
    }),
    request('Modifier une photo', 'PUT', '/photos/{{photoId}}', 200, {
      auth: 'other',
      access: 'Auteur de la photo.',
      text: 'Modifie l\'adresse ou la légende d\'une photo.',
      fields: [['url, caption', 'texte', false, 'Champs à modifier.']],
      errors: [E.validation, ['403', 'Vous n\'êtes pas l\'auteur de la photo.']],
      body: { caption: 'L\'arrivée des invités devant la salle des fêtes' },
    }),
    request('Commenter une photo', 'POST', '/photos/{{photoId}}/comments', 201, {
      access: ACCESS.member,
      text: 'Ajoute un commentaire sous une photo.',
      fields: [['content', 'texte', true, 'Contenu du commentaire (2000 caractères au maximum).']],
      rules: ['Règle 2.5 : les photos sont commentées par les participants de l\'événement.'],
      errors: [E.validation, E.notMember, ['404', 'Photo introuvable.']],
      body: { content: 'Très belle photo, on voit bien la décoration.' },
    }),
    request('Lister les commentaires d\'une photo', 'GET', '/photos/{{photoId}}/comments', 200, {
      access: ACCESS.viewer,
      text: 'Liste les commentaires d\'une photo, du plus ancien au plus récent.',
      query: PAGE_PARAMS,
    }),
    request('Supprimer une photo', 'DELETE', '/photos/{{photoId}}', 204, {
      auth: 'other',
      access: 'Auteur de la photo ou organisateurs de l\'événement.',
      text: 'Supprime une photo et ses commentaires.',
      errors: [['403', 'Vous n\'êtes ni l\'auteur ni un organisateur.']],
    }),
    request('Supprimer un album', 'DELETE', '/albums/{{albumId}}', 204, {
      access: 'Créateur de l\'album ou organisateurs de l\'événement.',
      text: 'Supprime un album, ses photos et leurs commentaires.',
      errors: [['403', 'Vous n\'êtes ni le créateur de l\'album ni un organisateur.']],
    }),
  ],
};

examples(albums, 'Ajouter une photo', [{ name: 'Adresse de photo invalide', expect: 400, body: { url: 'photo.jpg' } }]);

const polls = {
  name: '7. Sondages',
  description: `Cahier des charges 2.6.

**Règles :**
- Un événement peut avoir 0 ou plusieurs sondages, créés par un organisateur.
- Un sondage comporte 1 ou plusieurs questions.
- Chaque question propose plusieurs réponses possibles (au moins deux), mais une seule peut être choisie.
- Chaque participant répond au sondage en choisissant sa réponse pour chaque question.

Un participant répond une seule fois à un sondage. Il peut ensuite modifier ou retirer sa réponse.`,
  requests: [
    request('Créer un sondage', 'POST', '/events/{{eventId}}/polls', 201, {
      access: ACCESS.organizer,
      text: 'Crée un sondage avec ses questions et leurs réponses possibles. Chaque question et chaque réponse possible reçoit un identifiant `_id`, utilisé ensuite pour répondre.',
      fields: [
        ['title', 'texte', true, 'Titre du sondage.'],
        ['questions', 'liste', true, 'Au moins une question.'],
        ['questions[].text', 'texte', true, 'Intitulé de la question.'],
        ['questions[].answers', 'liste', true, 'Au moins deux réponses possibles. Chaque réponse est un texte, ou un objet `{ "text": "..." }`.'],
      ],
      rules: ['Règle 2.6 : seul un organisateur crée un sondage.', 'Règle 2.6 : 1 ou plusieurs questions, et plusieurs réponses possibles par question.'],
      errors: [E.validation, E.notOrganizer, E.eventNotFound],
      body: {
        title: 'Organisation du dîner',
        questions: [
          { text: 'Quel menu préférez-vous ?', answers: ['Menu classique', 'Menu végétarien', 'Menu sans gluten'] },
          { text: 'Resterez-vous pour la soirée dansante ?', answers: ['Oui', 'Non'] },
        ],
      },
      save: {
        pollId: 'data._id',
        question1Id: 'data.questions[0]._id',
        answer1Id: 'data.questions[0].answers[0]._id',
        answer1bId: 'data.questions[0].answers[1]._id',
        question2Id: 'data.questions[1]._id',
        answer2Id: 'data.questions[1].answers[0]._id',
      },
    }),
    request('Lister les sondages d\'un événement', 'GET', '/events/{{eventId}}/polls', 200, {
      access: ACCESS.viewer,
      text: 'Liste les sondages d\'un événement, du plus récent au plus ancien.',
      query: [{ key: 'q', value: 'dîner', description: 'Texte recherché dans le titre et les questions.', disabled: true }, ...PAGE_PARAMS],
      errors: [E.privateEvent, E.eventNotFound],
    }),
    request('Consulter un sondage', 'GET', '/polls/{{pollId}}', 200, {
      access: ACCESS.viewer,
      text: 'Renvoie un sondage avec ses questions, le nombre de personnes qui ont répondu (`responsesCount`) et si le demandeur a déjà répondu (`hasResponded`).',
      errors: [E.privateEvent, ['404', 'Sondage introuvable.']],
    }),
    request('Modifier un sondage', 'PUT', '/polls/{{pollId}}', 200, {
      access: ACCESS.organizer,
      text: 'Modifie le titre ou les questions d\'un sondage.',
      fields: [
        ['title', 'texte', false, 'Nouveau titre.'],
        ['questions', 'liste', false, 'Nouvelles questions. Elles remplacent les anciennes.'],
      ],
      rules: ['Les questions ne peuvent plus être modifiées dès qu\'un participant a répondu. Les réponses déjà données resteraient sinon rattachées à des questions disparues.'],
      errors: [E.validation, E.notOrganizer, ['409', 'Des participants ont déjà répondu au sondage.']],
      body: { title: 'Organisation du dîner et de la soirée' },
    }),
    request('Répondre à un sondage', 'POST', '/polls/{{pollId}}/responses', 201, {
      auth: 'other',
      access: ACCESS.member,
      text: 'Enregistre la réponse de l\'utilisateur connecté. Dans cette collection, c\'est le second compte, participant de l\'événement, qui répond.',
      fields: [
        ['answers', 'liste', true, 'Une entrée par question du sondage.'],
        ['answers[].question', 'identifiant', true, 'Identifiant de la question.'],
        ['answers[].answer', 'identifiant', true, 'Identifiant de la réponse choisie pour cette question.'],
      ],
      rules: [
        'Règle 2.6 : chaque participant choisit sa réponse pour chaque question. Toutes les questions doivent recevoir une réponse.',
        'Règle 2.6 : une seule réponse peut être choisie par question.',
        'La réponse choisie doit faire partie des réponses possibles de la question.',
        'Un participant ne répond qu\'une fois. Pour changer d\'avis, il modifie sa réponse.',
      ],
      errors: [['400', 'Question sans réponse, deux réponses pour une même question, ou réponse qui n\'appartient pas à la question.'], E.notMember, ['409', 'Vous avez déjà répondu à ce sondage.']],
      body: {
        answers: [
          { question: '{{question1Id}}', answer: '{{answer1Id}}' },
          { question: '{{question2Id}}', answer: '{{answer2Id}}' },
        ],
      },
    }),
    request('Consulter ma réponse', 'GET', '/polls/{{pollId}}/responses/me', 200, {
      auth: 'other',
      access: ACCESS.viewer,
      text: 'Renvoie la réponse de l\'utilisateur connecté à ce sondage.',
      errors: [['404', 'Vous n\'avez pas encore répondu à ce sondage.']],
    }),
    request('Modifier ma réponse', 'PUT', '/polls/{{pollId}}/responses/me', 200, {
      auth: 'other',
      access: 'Participant qui a déjà répondu.',
      text: 'Remplace la réponse de l\'utilisateur connecté. Les mêmes règles que pour la première réponse s\'appliquent.',
      fields: [['answers', 'liste', true, 'Une entrée par question, comme pour "Répondre à un sondage".']],
      errors: [['400', 'Réponse incomplète ou invalide.'], ['404', 'Vous n\'avez pas encore répondu à ce sondage.']],
      body: {
        answers: [
          { question: '{{question1Id}}', answer: '{{answer1bId}}' },
          { question: '{{question2Id}}', answer: '{{answer2Id}}' },
        ],
      },
    }),
    request('Lister les réponses des participants', 'GET', '/polls/{{pollId}}/responses', 200, {
      access: ACCESS.organizer,
      text: 'Liste la réponse détaillée de chaque participant, avec son profil public. Réservé aux organisateurs.',
      query: PAGE_PARAMS,
      errors: [E.notOrganizer],
    }),
    request('Résultats d\'un sondage', 'GET', '/polls/{{pollId}}/results', 200, {
      access: ACCESS.viewer,
      text: 'Endpoint spécifique. Renvoie les résultats du sondage : pour chaque réponse possible, le nombre de voix et le pourcentage, ainsi que le nombre total de personnes qui ont répondu. Les résultats ne révèlent pas qui a voté quoi.',
      errors: [E.privateEvent, ['404', 'Sondage introuvable.']],
    }),
    request('Retirer ma réponse', 'DELETE', '/polls/{{pollId}}/responses/me', 204, {
      auth: 'other',
      access: 'Participant qui a déjà répondu.',
      text: 'Supprime la réponse de l\'utilisateur connecté.',
      errors: [['404', 'Vous n\'avez pas encore répondu à ce sondage.']],
    }),
    request('Supprimer un sondage', 'DELETE', '/polls/{{pollId}}', 204, {
      access: ACCESS.organizer,
      text: 'Supprime un sondage et toutes les réponses des participants.',
      errors: [E.notOrganizer, ['404', 'Sondage introuvable.']],
    }),
  ],
};

examples(polls, 'Créer un sondage', [
  { name: 'Réservé aux organisateurs (règle 2.6)', expect: 403, auth: 'other' },
  { name: 'Question avec une seule réponse possible', expect: 400, body: { title: 'Sondage invalide', questions: [{ text: 'Venez-vous ?', answers: ['Oui'] }] } },
]);
examples(polls, 'Répondre à un sondage', [
  { name: 'Question sans réponse (règle 2.6)', expect: 400, body: { answers: [{ question: '{{question1Id}}', answer: '{{answer1Id}}' }] } },
  {
    name: 'Deux réponses pour la même question (règle 2.6)',
    expect: 400,
    body: {
      answers: [
        { question: '{{question1Id}}', answer: '{{answer1Id}}' },
        { question: '{{question1Id}}', answer: '{{answer1bId}}' },
        { question: '{{question2Id}}', answer: '{{answer2Id}}' },
      ],
    },
  },
  { name: 'Sondage déjà rempli', expect: 409 },
]);

const BUYER = {
  lastName: 'Petit',
  firstName: 'Camille',
  address: { street: '8 rue Victor Hugo', postalCode: '95300', city: 'Pontoise', country: 'France' },
};

const ticketing = {
  name: '8. Billetterie',
  description: `Cahier des charges 2.7.

**Règles :**
- Seul un événement public peut avoir une billetterie.
- Un organisateur crée 1 ou plusieurs types de billets. Un type de billet contient un nom, un montant et une quantité limitée.
- Une personne extérieure peut obtenir 1 seul billet par événement.
- Pour chaque billet acheté, on enregistre le type de billet, le nom, le prénom, l'adresse complète de la personne et la date d'achat.

**Personne extérieure :** elle n'a pas de compte. Les routes qui lui servent sont donc publiques : voir les billets en vente et obtenir un billet. Les autres routes sont réservées aux organisateurs.

**Un seul billet par personne :** comme une personne extérieure n'a pas de compte, elle est reconnue par son nom, son prénom et son adresse. La comparaison ignore les majuscules, les accents et les espaces en trop.

**Quantité limitée :** la réservation d'une place est une opération atomique dans la base. Même si plusieurs achats arrivent au même instant, il n'est jamais vendu plus de billets que la quantité prévue.`,
  requests: [
    request('Créer un type de billet', 'POST', '/events/{{eventId}}/ticket-types', 201, {
      access: ACCESS.organizer,
      text: 'Crée un type de billet pour un événement public. La réponse indique le nombre de billets vendus (`sold`) et restants (`remaining`).',
      fields: [
        ['name', 'texte', true, 'Nom du type de billet. Unique dans l\'événement.'],
        ['amount', 'nombre', true, 'Montant du billet. Zéro pour un billet gratuit.'],
        ['quantity', 'nombre entier', true, 'Quantité de billets disponibles, au moins 1.'],
      ],
      rules: ['Règle 2.7 : seuls les événements publics possèdent une billetterie.', 'Règle 2.7 : les types de billets sont créés par un organisateur.'],
      errors: [E.validation, ['403', 'L\'événement est privé, ou vous n\'êtes pas organisateur.'], ['409', 'Un type de billet porte déjà ce nom pour cet événement.']],
      body: { name: 'Tarif normal', amount: 25, quantity: 150 },
      save: { ticketTypeId: 'data._id' },
    }),
    request('Créer un second type de billet', 'POST', '/events/{{eventId}}/ticket-types', 201, {
      access: ACCESS.organizer,
      summary: 'Variante : un événement peut avoir plusieurs types de billets.',
      text: 'Même route. Un organisateur peut créer plusieurs types de billets pour le même événement. Celui-ci est limité à 2 billets.',
      body: { name: 'Tarif VIP', amount: 60, quantity: 2 },
      save: { vipTicketTypeId: 'data._id' },
    }),
    request('Voir les billets en vente', 'GET', '/events/{{eventId}}/ticket-types', 200, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Liste les types de billets d\'un événement public, du moins cher au plus cher, avec le nombre de billets restants. Cette route est publique pour qu\'une personne extérieure puisse choisir son billet.',
      query: [{ key: 'q', value: 'vip', description: 'Texte recherché dans le nom du type de billet.', disabled: true }, ...PAGE_PARAMS],
      errors: [['403', 'L\'événement est privé : il n\'a pas de billetterie.'], E.eventNotFound],
    }),
    request('Consulter un type de billet', 'GET', '/ticket-types/{{ticketTypeId}}', 200, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Renvoie un type de billet avec le nombre de billets vendus et restants.',
      errors: [['404', 'Type de billet introuvable.']],
    }),
    request('Modifier un type de billet', 'PUT', '/ticket-types/{{ticketTypeId}}', 200, {
      access: ACCESS.organizer,
      text: 'Modifie le nom, le montant ou la quantité d\'un type de billet.',
      fields: [['name, amount, quantity', 'voir "Créer un type de billet"', false, 'Champs à modifier.']],
      rules: ['La quantité ne peut pas être inférieure au nombre de billets déjà vendus.'],
      errors: [E.validation, E.notOrganizer, ['409', 'La quantité demandée est inférieure au nombre de billets vendus.']],
      body: { amount: 22, quantity: 200 },
    }),
    request('Obtenir un billet', 'POST', '/events/{{eventId}}/tickets', 201, {
      auth: 'none',
      access: ACCESS.public,
      text: 'Une personne extérieure obtient un billet pour un événement public. La date d\'achat (`purchasedAt`) est enregistrée automatiquement.',
      fields: [
        ['ticketType', 'identifiant', true, 'Type de billet choisi, parmi ceux créés par l\'organisateur.'],
        ['lastName', 'texte', true, 'Nom de la personne.'],
        ['firstName', 'texte', true, 'Prénom de la personne.'],
        ['address.street', 'texte', true, 'Numéro et rue.'],
        ['address.postalCode', 'texte', true, 'Code postal.'],
        ['address.city', 'texte', true, 'Ville.'],
        ['address.country', 'texte', true, 'Pays.'],
      ],
      rules: [
        'Règle 2.7 : une personne extérieure ne peut obtenir qu\'un seul billet par événement, quel que soit le type de billet.',
        'Règle 2.7 : la quantité de billets est limitée. Quand tous les billets d\'un type sont vendus, l\'achat est refusé.',
        'La billetterie ferme quand l\'événement est terminé.',
        'Le nombre de demandes est limité (60 par quart d\'heure et par adresse IP).',
      ],
      errors: [E.validation, ['403', 'L\'événement est privé.'], ['404', 'Ce type de billet n\'existe pas pour cet événement.'], ['409', 'La personne a déjà un billet, il n\'y a plus de billets, ou l\'événement est terminé.']],
      body: { ticketType: '{{ticketTypeId}}', ...BUYER },
      save: { ticketId: 'data._id' },
    }),
    request('Lister les billets vendus', 'GET', '/events/{{eventId}}/tickets', 200, {
      access: ACCESS.organizer,
      text: 'Liste les billets vendus pour l\'événement, du plus récent au plus ancien, avec leur type. Réservé aux organisateurs car la liste contient des données personnelles.',
      query: [
        { key: 'q', value: 'petit', description: 'Texte recherché dans le nom, le prénom et la ville.', disabled: true },
        { key: 'ticketType', value: '{{ticketTypeId}}', description: 'Seulement les billets de ce type.', disabled: true },
        ...PAGE_PARAMS,
      ],
      errors: [E.auth, E.notOrganizer],
    }),
    request('Consulter un billet', 'GET', '/tickets/{{ticketId}}', 200, {
      access: ACCESS.organizer,
      text: 'Renvoie un billet avec son type, les données de la personne et la date d\'achat.',
      errors: [E.notOrganizer, ['404', 'Billet introuvable.']],
    }),
    request('Corriger un billet', 'PUT', '/tickets/{{ticketId}}', 200, {
      access: ACCESS.organizer,
      text: 'Corrige les données de la personne sur un billet, par exemple une faute dans l\'adresse. Seuls les champs envoyés sont modifiés, y compris à l\'intérieur de l\'adresse.',
      fields: [
        ['lastName, firstName', 'texte', false, 'Nom et prénom corrigés.'],
        ['address', 'objet', false, 'Parties de l\'adresse à corriger : `street`, `postalCode`, `city`, `country`.'],
      ],
      rules: ['Le type de billet et la date d\'achat ne sont pas modifiables.', 'La correction ne doit pas créer un doublon avec une autre personne déjà inscrite.'],
      errors: [E.validation, E.notOrganizer, ['409', 'Cette personne possède déjà un billet pour cet événement.']],
      body: { address: { street: '10 rue Victor Hugo' } },
    }),
    request('Supprimer un type de billet', 'DELETE', '/ticket-types/{{vipTicketTypeId}}', 204, {
      access: ACCESS.organizer,
      text: 'Supprime un type de billet. Dans cette collection, c\'est le type "Tarif VIP", pour lequel aucun billet n\'a été vendu.',
      rules: ['Un type de billet ne peut pas être supprimé tant que des billets de ce type existent.'],
      errors: [E.notOrganizer, ['409', 'Des billets de ce type ont déjà été vendus.']],
    }),
    request('Annuler un billet', 'DELETE', '/tickets/{{ticketId}}', 204, {
      access: ACCESS.organizer,
      text: 'Supprime un billet. La place redevient disponible pour ce type de billet.',
      errors: [E.notOrganizer, ['404', 'Billet introuvable.']],
    }),
  ],
};

examples(ticketing, 'Créer un type de billet', [
  { name: 'Billetterie sur un événement privé (règle 2.7)', expect: 403, path: '/events/{{groupEventId}}/ticket-types' },
  { name: 'Réservé aux organisateurs (règle 2.7)', expect: 403, auth: 'other', body: { name: 'Tarif pirate', amount: 1, quantity: 1 } },
]);
examples(ticketing, 'Obtenir un billet', [
  { name: 'Un seul billet par personne (règle 2.7)', expect: 409, body: { ticketType: '{{vipTicketTypeId}}', ...BUYER, lastName: 'PETIT', firstName: 'camille' } },
  {
    name: 'Plus de billets disponibles (règle 2.7)',
    expect: 409,
    body: { ticketType: '{{vipTicketTypeId}}', ...BUYER, lastName: 'Moreau', firstName: 'Inès' },
    // Pour cet exemple, les 2 billets "Tarif VIP" sont d'abord achetés par deux autres personnes,
    // puis annulés une fois l'exemple enregistré.
    setup: async (call, vars) => {
      vars.hiddenTickets = [];
      for (const [lastName, firstName] of [['Roux', 'Hugo'], ['Faure', 'Léa']]) {
        const ticket = await call('POST', '/events/{{eventId}}/tickets', {
          auth: 'none',
          body: { ticketType: '{{vipTicketTypeId}}', ...BUYER, lastName, firstName },
        });
        vars.hiddenTickets.push(ticket.data._id);
      }
    },
    teardown: async (call, vars) => {
      for (const id of vars.hiddenTickets) await call('DELETE', `/tickets/${id}`);
      delete vars.hiddenTickets;
    },
  },
  { name: 'Adresse incomplète', expect: 400, body: { ticketType: '{{ticketTypeId}}', lastName: 'Durand', firstName: 'Paul', address: { city: 'Cergy' } } },
]);
examples(ticketing, 'Lister les billets vendus', [{ name: 'Réservé aux organisateurs', expect: 403, auth: 'other' }]);
examples(ticketing, 'Supprimer un type de billet', [
  { name: 'Billets déjà vendus pour ce type', expect: 409, path: '/ticket-types/{{ticketTypeId}}' },
]);

const shopping = {
  name: '9. Shopping list',
  description: `Cahier des charges 2.8.

Quand la shopping list est activée sur un événement, un utilisateur indique ce qu'il va apporter : un nom, une quantité et son heure d'arrivée à l'événement.

**Règles :**
- La shopping list doit être activée par un organisateur (\`shoppingListEnabled: true\` sur l'événement). Sinon, ces routes renvoient une erreur 409.
- Chaque chose apportée est unique par événement. La comparaison du nom ignore les majuscules, les accents et les espaces en trop : "Chips" et "chips" sont la même chose.
- Seuls les participants et les organisateurs de l'événement utilisent la shopping list.`,
  requests: [
    request('Ajouter un élément', 'POST', '/events/{{eventId}}/shopping-items', 201, {
      access: ACCESS.member,
      text: 'L\'utilisateur connecté indique ce qu\'il apporte à l\'événement.',
      fields: [
        ['name', 'texte', true, 'Nom de ce qui est apporté. Unique dans l\'événement.'],
        ['quantity', 'nombre entier', true, 'Quantité, au moins 1.'],
        ['arrivalTime', 'date ISO 8601', true, 'Heure d\'arrivée à l\'événement. Elle ne peut pas être après la fin de l\'événement.'],
      ],
      rules: ['Règle 2.8 : chaque chose apportée doit être unique par événement.'],
      errors: [E.validation, E.notMember, ['409', 'La shopping list n\'est pas activée, ou cet élément est déjà apporté par quelqu\'un.']],
      body: { name: 'Jus de fruits', quantity: 6, arrivalTime: '2027-06-19T17:30:00.000Z' },
      save: { shoppingItemId: 'data._id' },
    }),
    request('Consulter la shopping list', 'GET', '/events/{{eventId}}/shopping-items', 200, {
      access: ACCESS.member,
      text: 'Liste ce que chacun apporte à l\'événement, trié par heure d\'arrivée, avec le profil public de la personne.',
      query: [{ key: 'q', value: 'jus', description: 'Texte recherché dans le nom.', disabled: true }, ...PAGE_PARAMS],
      errors: [E.notMember, ['409', 'La shopping list n\'est pas activée pour cet événement.']],
    }),
    request('Consulter un élément', 'GET', '/shopping-items/{{shoppingItemId}}', 200, {
      access: ACCESS.member,
      text: 'Renvoie un élément de la shopping list.',
      errors: [E.notMember, ['404', 'Élément introuvable.']],
    }),
    request('Modifier un élément', 'PUT', '/shopping-items/{{shoppingItemId}}', 200, {
      access: 'Personne qui apporte l\'élément.',
      text: 'Modifie le nom, la quantité ou l\'heure d\'arrivée.',
      fields: [['name, quantity, arrivalTime', 'voir "Ajouter un élément"', false, 'Champs à modifier.']],
      rules: ['Le nouveau nom ne doit pas être déjà utilisé dans la shopping list de l\'événement.'],
      errors: [E.validation, ['403', 'Cet élément est apporté par quelqu\'un d\'autre.'], ['409', 'Un élément porte déjà ce nom.']],
      body: { quantity: 8, arrivalTime: '2027-06-19T17:15:00.000Z' },
    }),
    request('Retirer un élément', 'DELETE', '/shopping-items/{{shoppingItemId}}', 204, {
      access: 'Personne qui apporte l\'élément, ou organisateurs de l\'événement.',
      text: 'Retire un élément de la shopping list. Son nom redevient disponible.',
      errors: [['403', 'Vous n\'êtes ni la personne qui apporte l\'élément ni un organisateur.']],
    }),
  ],
};

examples(shopping, 'Ajouter un élément', [
  { name: 'Élément déjà apporté (règle 2.8)', expect: 409, auth: 'other', body: { name: 'jus de FRUITS', quantity: 2, arrivalTime: '2027-06-19T18:00:00.000Z' } },
  { name: 'Shopping list non activée (règle 2.8)', expect: 409, path: '/events/{{groupEventId}}/shopping-items' },
]);
examples(shopping, 'Modifier un élément', [{ name: 'Élément d\'une autre personne', expect: 403, auth: 'other', body: { quantity: 1 } }]);

const carpools = {
  name: '10. Covoiturage (bonus)',
  description: `Cahier des charges 3 (bonus).

Quand le covoiturage est activé sur un événement, un utilisateur indique qu'il s'y rend en voiture : lieu de départ, heure de départ, prix proposé, nombre de places disponibles et temps maximum d'écart.

**Temps maximum d'écart** (\`maxDetourMinutes\`) : le détour que le conducteur accepte pour prendre des passagers, en minutes. Exemple du cahier des charges : sur un trajet de 2h30, un écart de 30 minutes donne un trajet maximum de 3h.

**Règles :**
- Le covoiturage doit être activé par un organisateur (\`carpoolingEnabled: true\` sur l'événement). Sinon, ces routes renvoient une erreur 409.
- Seuls les participants et les organisateurs de l'événement proposent et consultent les covoiturages.
- Un utilisateur propose un seul covoiturage par événement.`,
  requests: [
    request('Proposer un covoiturage', 'POST', '/events/{{eventId}}/carpools', 201, {
      access: ACCESS.member,
      text: 'L\'utilisateur connecté indique qu\'il se rend à l\'événement en voiture. Il devient le conducteur de ce covoiturage.',
      fields: [
        ['departureLocation', 'texte', true, 'Lieu de départ.'],
        ['departureTime', 'date ISO 8601', true, 'Heure de départ. Elle ne peut pas être après la fin de l\'événement.'],
        ['price', 'nombre', true, 'Prix proposé par passager. Zéro pour un trajet gratuit.'],
        ['availableSeats', 'nombre entier', true, 'Nombre de places disponibles, de 1 à 8.'],
        ['maxDetourMinutes', 'nombre entier', true, 'Temps maximum d\'écart accepté, en minutes.'],
      ],
      errors: [E.validation, E.notMember, ['409', 'Le covoiturage n\'est pas activé, ou vous proposez déjà un covoiturage pour cet événement.']],
      body: {
        departureLocation: 'Gare de Cergy-Préfecture',
        departureTime: '2027-06-19T16:45:00.000Z',
        price: 5,
        availableSeats: 3,
        maxDetourMinutes: 30,
      },
      save: { carpoolId: 'data._id' },
    }),
    request('Lister les covoiturages', 'GET', '/events/{{eventId}}/carpools', 200, {
      access: ACCESS.member,
      text: 'Liste les covoiturages proposés pour l\'événement, triés par heure de départ, avec le profil public du conducteur.',
      query: [
        { key: 'q', value: 'cergy', description: 'Texte recherché dans le lieu de départ.', disabled: true },
        { key: 'maxPrice', value: '10', description: 'Prix maximum par passager.', disabled: true },
        ...PAGE_PARAMS,
      ],
      errors: [E.notMember, ['409', 'Le covoiturage n\'est pas activé pour cet événement.']],
    }),
    request('Consulter un covoiturage', 'GET', '/carpools/{{carpoolId}}', 200, {
      access: ACCESS.member,
      text: 'Renvoie un covoiturage avec le profil public du conducteur.',
      errors: [E.notMember, ['404', 'Covoiturage introuvable.']],
    }),
    request('Modifier un covoiturage', 'PUT', '/carpools/{{carpoolId}}', 200, {
      access: 'Conducteur du covoiturage.',
      text: 'Modifie les informations d\'un covoiturage. Seuls les champs envoyés sont modifiés.',
      fields: [['departureLocation, departureTime, price, availableSeats, maxDetourMinutes', 'voir "Proposer un covoiturage"', false, 'Champs à modifier.']],
      errors: [E.validation, ['403', 'Vous n\'êtes pas le conducteur.']],
      body: { availableSeats: 2, price: 4 },
    }),
    request('Supprimer un covoiturage', 'DELETE', '/carpools/{{carpoolId}}', 204, {
      access: 'Conducteur du covoiturage, ou organisateurs de l\'événement.',
      text: 'Supprime un covoiturage.',
      errors: [['403', 'Vous n\'êtes ni le conducteur ni un organisateur.']],
    }),
  ],
};

examples(carpools, 'Proposer un covoiturage', [
  { name: 'Un seul covoiturage par utilisateur et par événement', expect: 409 },
  { name: 'Covoiturage non activé', expect: 409, path: '/events/{{groupEventId}}/carpools' },
  { name: 'Données invalides', expect: 400, auth: 'other', body: { departureLocation: 'Pontoise', price: -5, availableSeats: 12 } },
]);

export const folders = [general, authentication, users, events, groups, threads, albums, polls, ticketing, shopping, carpools];

// Rattache les exemples d'erreurs à leurs requêtes. Le champ "errors" contenait jusque-là
// les erreurs décrites dans le texte : il est remplacé par les exemples à exécuter.
for (const folder of folders) {
  for (const item of folder.requests) {
    item.errors = errorExamples.get(`${folder.name}/${item.name}`) ?? [];
  }
}
for (const key of errorExamples.keys()) {
  const [folderName, requestName] = key.split('/');
  const folder = folders.find((item) => item.name === folderName);
  if (!folder?.requests.some((item) => item.name === requestName)) throw new Error(`Exemple d'erreur sans requête : ${key}`);
}
