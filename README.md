# My Social Networks API

API REST du TP "Développement d'un Web Service" : refonte des API d'un réseau social autour des événements et des groupes.

Elle couvre tout le cahier des charges : utilisateurs, événements, groupes, fils de discussion, albums photo, sondages, billetterie, shopping list, et le bonus covoiturage.

**Technologies :** Node.js, Express, MongoDB (Mongoose), authentification JWT.

## Documentation

| Document | Emplacement |
|---|---|
| **Documentation Postman publiée** | `À COMPLÉTER : coller ici l'URL obtenue après publication` |
| Collection Postman à importer | [`postman/My_Social_Networks_API.postman_collection.json`](postman/My_Social_Networks_API.postman_collection.json) |
| Liste de toutes les routes | [`docs/API.md`](docs/API.md) |
| Choix de conception et modèle de données | [`docs/CONCEPTION.md`](docs/CONCEPTION.md) |

La collection Postman contient 102 requêtes rangées dans l'ordre du cahier des charges. Chaque requête a son URL, une explication fonctionnelle (rôle, droits, champs, règles, erreurs) et des exemples des données renvoyées : 140 exemples de réponses, dont les cas d'erreur qui montrent les règles du cahier des charges.

### Publier la documentation Postman

1. Ouvrir Postman, cliquer sur **Import** et choisir le fichier `postman/My_Social_Networks_API.postman_collection.json`.
2. Ouvrir la collection, puis sa documentation (**View complete documentation**).
3. Cliquer sur **Publish**, vérifier les réglages, puis confirmer.
4. Copier l'URL publique affichée et la coller dans le tableau ci-dessus.

Le nom exact des boutons peut changer un peu selon la version de Postman.

### Utiliser la collection

1. Lancer l'API en local (voir plus bas).
2. Dans Postman, ouvrir la collection. La variable `baseUrl` vaut `http://localhost:3000/api`.
3. Lancer les requêtes dans l'ordre, une par une ou avec le **Runner**. Les tokens et les identifiants sont enregistrés automatiquement dans les variables de la collection.

## Démarrage rapide

**Prérequis :** Node.js 22 ou plus, et une base MongoDB (locale, Docker ou MongoDB Atlas).

```bash
# 1. Installer les dépendances
npm install

# 2. Créer le fichier de configuration
cp .env.example .env
# Puis renseigner JWT_SECRET dans .env. Pour générer un secret :
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

# 3. Lancer MongoDB (facultatif si vous avez déjà une base)
docker compose up -d

# 4. Lancer l'API
npm run dev
```

L'API répond sur `http://localhost:3000/api`. Pour vérifier : `http://localhost:3000/api/health`.

### Commandes

| Commande | Rôle |
|---|---|
| `npm start` | Lance l'API |
| `npm run dev` | Lance l'API et la redémarre à chaque modification |
| `npm test` | Lance les tests d'intégration |
| `npm run lint` | Vérifie la qualité du code avec ESLint |
| `npm run docs:build` | Régénère la collection Postman et `docs/API.md` |

### Configuration (`.env`)

| Variable | Rôle | Valeur par défaut |
|---|---|---|
| `PORT` | Port d'écoute | `3000` |
| `MONGODB_URI` | Adresse de la base MongoDB | `mongodb://127.0.0.1:27017/my_social_networks` |
| `JWT_SECRET` | Secret de signature des tokens, 32 caractères au minimum. Obligatoire | aucune |
| `JWT_EXPIRES_IN` | Durée de validité d'un token | `2h` |
| `CORS_ORIGIN` | Origine autorisée par CORS | `*` |
| `PUBLIC_APP_URL` | Adresse du site, utilisée dans les liens de partage | `http://localhost:3000` |
| `POSTMAN_DOC_URL` | Adresse de la documentation publiée, renvoyée par `GET /api` | vide |

## Premier appel

```bash
# Créer un compte : la réponse contient un token
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"firstName":"Awa","lastName":"Diallo","email":"awa@example.com","password":"MotDePasse123!"}'

# Créer un événement avec ce token
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"Gala","startDate":"2027-06-19T18:00:00Z","endDate":"2027-06-20T01:00:00Z","location":"Cergy","visibility":"public"}'
```

## Correspondance avec le cahier des charges

| Cahier des charges | Règle | Où c'est fait |
|---|---|---|
| 1.1 Événement | Nom, description, dates, lieu, photo de couverture, visibilité, organisateurs et participants | `POST /events`, modèle `Event` |
| 1.2 Groupes | Nom, description, icône, photo de couverture, type public, privé ou secret, deux autorisations | `POST /groups`, modèle `Group` |
| 1.2 Groupes | Événement dans un groupe : tous les membres invités en un clic | `POST /events` avec `group`, `POST /events/:id/invite-group` |
| 1.2 Groupes | Partage sur les autres réseaux dans un groupe public | `GET /events/:id/share` |
| 1.2 Groupes | Un fil de discussion dans chaque groupe | Créé automatiquement avec le groupe |
| 2.1 Utilisateurs | Attributs définis, email unique | Modèle `User`, index unique sur `email` |
| 2.2 Événements | Multitude de participants, 1 ou plusieurs organisateurs | Routes `/events/:id/participants` et `/events/:id/organizers` |
| 2.3 Groupes | 1 ou plusieurs membres, 1 ou plusieurs administrateurs | Routes `/groups/:id/members` et `/groups/:id/admins` |
| 2.4 Discussions | Fil lié à 1 groupe ou 1 événement, pas les deux | Validation du modèle `Thread` |
| 2.4 Discussions | Messages et commentaires par les membres et participants | Routes `/threads/:id/messages` et `/messages/:id/comments` |
| 2.5 Albums | Album lié à 1 événement, photos et commentaires par les participants | Routes `/events/:id/albums`, `/albums/:id/photos`, `/photos/:id/comments` |
| 2.6 Sondages | Créé par un organisateur, 1 ou plusieurs questions, une seule réponse par question | Routes `/events/:id/polls` et `/polls/:id/responses` |
| 2.7 Billetterie | Événement public, types de billets avec nom, montant et quantité limitée | Routes `/events/:id/ticket-types` |
| 2.7 Billetterie | Une personne extérieure obtient 1 seul billet, avec nom, prénom, adresse et date d'achat | `POST /events/:id/tickets` (route publique) |
| 2.8 Shopping list | Activable, nom, quantité, heure d'arrivée, élément unique par événement | Routes `/events/:id/shopping-items` |
| 3 Covoiturage (bonus) | Activable, lieu et heure de départ, prix, places, temps maximum d'écart | Routes `/events/:id/carpools` |
| CRUDS | Créer, lire, modifier, supprimer, rechercher pour chaque ressource | Voir `docs/API.md` |
| Endpoints spécifiques | Données mises à disposition par des routes dédiées | Résumé d'un événement, résultats d'un sondage, liens de partage, événements et groupes d'un utilisateur, membres, participants |

## Tests

```bash
npm test
```

Les 89 tests d'intégration appellent l'API sur une vraie base MongoDB et vérifient chaque règle du cahier des charges, y compris les cas limites : achats de billets simultanés, dernier organisateur, groupe secret, doublons dans la shopping list.

Ils utilisent une base séparée (`my_social_networks_test`), vidée à chaque lancement. Pour utiliser une autre base : variable `MONGODB_URI_TEST`.

## Structure du projet

```
src/
  server.js            Démarrage : connexion à la base puis écoute HTTP
  app.js               Application Express et middlewares globaux
  config/              Variables d'environnement et connexion MongoDB
  models/              Schémas Mongoose (validations et index)
  controllers/         Une fonction par route
  routes/              Association des URL aux contrôleurs
  middlewares/         Authentification JWT, sécurité, gestion des erreurs
  services/            Règles de droits (access.js) et suppressions en cascade (cascade.js)
  utils/               Erreurs HTTP et fonctions communes
tests/                 Tests d'intégration
scripts/               Génération de la documentation Postman
postman/               Collection Postman
docs/                  Référence des routes et document de conception
```

## Sécurité

- Mots de passe hachés avec bcrypt, jamais renvoyés.
- Tokens JWT obligatoires sur toutes les routes, sauf les informations générales, l'inscription, la connexion et la billetterie publique.
- Changer de mot de passe invalide les anciens tokens.
- Limite de débit sur l'inscription, la connexion et l'achat de billets.
- Protection contre les injections NoSQL et contre la modification de champs internes.
- En-têtes de sécurité avec `helmet`.
- L'email et le téléphone d'un utilisateur ne sont visibles que par lui.

Le détail est dans [`docs/CONCEPTION.md`](docs/CONCEPTION.md).
