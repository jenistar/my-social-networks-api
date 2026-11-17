# Référence de l'API My Social Networks

Ce fichier est généré par `npm run docs:build` à partir du même catalogue que la collection Postman.
Il liste les 102 requêtes documentées. Les exemples complets de requêtes et de réponses sont dans la collection Postman.

Toutes les routes commencent par `/api`. Sauf mention "Public", un token JWT est obligatoire (`Authorization: Bearer <token>`).

## 0. Informations générales

Routes publiques pour vérifier que l'API fonctionne. Utiles pour une supervision ou un test de déploiement.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `GET` | `/` | Renvoie le nom et la version de l'API, ainsi que l'adresse de sa documentation. | Public. Aucun token nécessaire. |
| `GET` | `/health` | Indique si l'API répond et si elle est connectée à la base de données. | Public. Aucun token nécessaire. |

## 1. Authentification

Inscription et connexion. Le mot de passe est haché avec bcrypt et n'est jamais renvoyé. Le token JWT obtenu est valable 2 heures par défaut.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/auth/register` | Crée un utilisateur et renvoie son token JWT. | Public. Aucun token nécessaire. |
| `POST` | `/auth/login` | Vérifie l'email et le mot de passe, puis renvoie le profil et un nouveau token JWT. | Public. Aucun token nécessaire. |
| `GET` | `/auth/me` | Renvoie le profil complet de l'utilisateur connecté, y compris son email et son téléphone. | Tout utilisateur connecté. |

## 2. Utilisateurs

Cahier des charges 2.1. La création d'un utilisateur se fait avec `POST /auth/register` (dossier Authentification).

**Attributs d'un utilisateur :** prénom, nom, email (unique), mot de passe (haché), date de naissance, téléphone, ville, présentation, photo de profil, dates de création et de modification.

**Vie privée :** l'email, le téléphone et la date de naissance ne sont visibles que par l'utilisateur lui-même. Les autres ne voient que le profil public (prénom, nom, ville, présentation, photo).

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `GET` | `/users` | Recherche des utilisateurs par prénom, nom ou ville. | Tout utilisateur connecté. |
| `GET` | `/users/:id` | Renvoie le profil public d'un utilisateur. | Tout utilisateur connecté. |
| `PUT` | `/users/:id` | Modifie le profil de l'utilisateur connecté. | Utilisateur connecté, sur son propre compte uniquement. |
| `GET` | `/users/:id/events` | Liste les événements d'un utilisateur, avec son rôle dans chacun. | Tout utilisateur connecté. |
| `GET` | `/users/:id/groups` | Liste les groupes d'un utilisateur, avec son rôle dans chacun. | Tout utilisateur connecté. |
| `DELETE` | `/users/:id` | Supprime le compte de l'utilisateur connecté. | Utilisateur connecté, sur son propre compte uniquement. |

## 3. Événements

Cahier des charges 1.1 et 2.2.

**Étape 1, configuration de l'événement :** nom, description, date de début, date de fin, lieu, photo de couverture, visibilité (public ou privé), organisateurs et participants.

**Règles :**
- Un événement peut avoir une multitude de participants.
- Un événement est géré par 1 ou plusieurs organisateurs. Le dernier organisateur ne peut pas être retiré.
- Un événement **public** est visible par tous. Un événement **privé** n'est accessible qu'aux personnes invitées.
- Par défaut, un événement est privé.

**Options activables sur un événement :** la shopping list (`shoppingListEnabled`) et le covoiturage (`carpoolingEnabled`). La billetterie est disponible dès qu'un événement public possède un type de billet.

Les événements créés dans un groupe (invitation automatique des membres, partage) sont décrits dans le dossier Groupes.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events` | Crée un événement. | Tout utilisateur connecté. |
| `GET` | `/events` | Recherche parmi les événements publics et les événements où l'utilisateur connecté est organisateur ou participant. | Tout utilisateur connecté. |
| `GET` | `/events/:id` | Renvoie le détail d'un événement, avec le profil public de ses organisateurs et de ses participants, et son groupe s'il en a un. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `PUT` | `/events/:id` | Modifie les informations d'un événement. | Organisateurs de l'événement. |
| `GET` | `/events/:id/participants` | Endpoint spécifique. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `POST` | `/events/:id/join` | L'utilisateur connecté s'inscrit lui-même à un événement public. | Tout utilisateur connecté. |
| `DELETE` | `/events/:id/participants/:userId` | Retire une personne de la liste des participants. | Organisateurs de l'événement, ou le participant lui-même pour se désinscrire. |
| `POST` | `/events/:id/participants` | Un organisateur ajoute un ou plusieurs utilisateurs à la liste des participants. | Organisateurs de l'événement. |
| `POST` | `/events/:id/organizers` | Donne le rôle d'organisateur à un ou plusieurs utilisateurs. | Organisateurs de l'événement. |
| `DELETE` | `/events/:id/organizers/:userId` | Retire le rôle d'organisateur à une personne. | Organisateurs de l'événement. |
| `GET` | `/events/:id/summary` | Endpoint spécifique. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `DELETE` | `/events/:id` | Supprime un événement et tout ce qui en dépend : fils de discussion, messages, commentaires, albums, photos, sondages, réponses, types de billets, billets, shopping list et covoiturages. | Organisateurs de l'événement. |

## 4. Groupes

Cahier des charges 1.2 et 2.3.

**Paramètres d'un groupe :** nom, description, icône, photo de couverture, type (public, privé ou secret), autorisation pour les membres de publier (`allowMembersToPost`), autorisation pour les membres de créer des événements (`allowMembersToCreateEvents`).

**Types de groupe :**

| Type | Qui peut trouver le groupe | Qui voit les membres et le contenu | Comment entrer |
|---|---|---|---|
| `public` | Tout le monde | Tout le monde | Librement, ou ajouté par un administrateur |
| `private` | Tout le monde | Les membres | Ajouté par un administrateur |
| `secret` | Les membres | Les membres | Ajouté par un administrateur |

**Règles :**
- Un groupe possède 1 ou plusieurs membres et est géré par 1 ou plusieurs administrateurs.
- Un administrateur est toujours membre. Le dernier administrateur ne peut pas être retiré.
- Un fil de discussion est créé automatiquement avec chaque groupe.
- Un événement créé dans un groupe invite automatiquement tous ses membres.
- Dans un groupe public, les organisateurs peuvent partager leurs événements sur les autres réseaux sociaux.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/groups` | Crée un groupe. | Tout utilisateur connecté. |
| `GET` | `/groups` | Recherche des groupes par nom ou description. | Tout utilisateur connecté. |
| `GET` | `/groups/:id` | Renvoie les paramètres du groupe, le nombre de membres et le rôle du demandeur. | Tout utilisateur connecté pour un groupe public ou privé. Membres uniquement pour un groupe secret. |
| `PUT` | `/groups/:id` | Modifie les paramètres du groupe. | Administrateurs du groupe. |
| `GET` | `/groups/:id/members` | Endpoint spécifique. | Tout utilisateur connecté si le groupe est public. Membres uniquement si le groupe est privé ou secret. |
| `POST` | `/groups/:id/join` | L'utilisateur connecté devient membre d'un groupe public. | Tout utilisateur connecté. |
| `DELETE` | `/groups/:id/members/:userId` | Retire une personne du groupe. | Administrateurs du groupe, ou le membre lui-même pour quitter le groupe. |
| `POST` | `/groups/:id/members` | Un administrateur ajoute un ou plusieurs utilisateurs au groupe. | Administrateurs du groupe. |
| `POST` | `/groups/:id/admins` | Donne le rôle d'administrateur à un ou plusieurs utilisateurs. | Administrateurs du groupe. |
| `DELETE` | `/groups/:id/admins/:userId` | Retire le rôle d'administrateur à une personne. | Administrateurs du groupe. |
| `POST` | `/events` | Crée un événement dans un groupe et invite tous ses membres. | Administrateurs du groupe. Membres aussi si le groupe l'autorise (`allowMembersToCreateEvents`). |
| `GET` | `/groups/:id/events` | Endpoint spécifique. | Tout utilisateur connecté si le groupe est public. Membres uniquement si le groupe est privé ou secret. |
| `POST` | `/events/:id/invite-group` | Invite en une seule action tous les membres actuels du groupe à l'événement. | Organisateurs de l'événement. |
| `GET` | `/events/:id/share` | Endpoint spécifique. | Organisateurs de l'événement. |
| `GET` | `/groups/:id/threads` | Endpoint spécifique. | Tout utilisateur connecté si le groupe est public. Membres uniquement si le groupe est privé ou secret. |
| `DELETE` | `/groups/:id` | Supprime un groupe avec ses fils de discussion, leurs messages et leurs commentaires. | Administrateurs du groupe. |

## 5. Fils de discussion

Cahier des charges 2.4.

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

Chaque groupe garde toujours au moins un fil de discussion.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/threads` | Crée un fil de discussion lié à un événement ou à un groupe. | Organisateurs de l'événement, ou administrateurs du groupe. |
| `GET` | `/threads` | Liste les fils d'un événement ou d'un groupe. | Tout utilisateur connecté. |
| `GET` | `/threads/:id` | Renvoie le fil, son nombre de messages et les droits du demandeur sur ce fil (`permissions`) : lire, publier, commenter, gérer. | Utilisateur connecté qui a le droit de lire le fil. |
| `PUT` | `/threads/:id` | Modifie le titre du fil. | Organisateurs de l'événement, ou administrateurs du groupe. |
| `POST` | `/threads/:id/messages` | Publie un message dans le fil. | Participants et organisateurs (fil d'événement). Administrateurs, et membres si le groupe l'autorise (fil de groupe). |
| `GET` | `/threads/:id/messages` | Liste les messages du fil, du plus récent au plus ancien, avec le profil public de leur auteur. | Utilisateur connecté qui a le droit de lire le fil. |
| `GET` | `/messages/:id` | Renvoie un message avec le profil public de son auteur. | Utilisateur connecté qui a le droit de lire le fil. |
| `PUT` | `/messages/:id` | Modifie le contenu d'un message. | Auteur du message. |
| `POST` | `/messages/:id/comments` | Ajoute un commentaire sous un message. | Membres du groupe, ou participants et organisateurs de l'événement. |
| `GET` | `/messages/:id/comments` | Liste les commentaires d'un message, du plus ancien au plus récent, avec le profil public de leur auteur. | Utilisateur connecté qui a le droit de lire le fil. |
| `GET` | `/comments/:id` | Renvoie un commentaire. | Utilisateur connecté qui a le droit de lire le message ou la photo commentée. |
| `PUT` | `/comments/:id` | Modifie le contenu d'un commentaire de message ou de photo. | Auteur du commentaire. |
| `DELETE` | `/comments/:id` | Supprime un commentaire de message ou de photo. | Auteur du commentaire, administrateurs du groupe ou organisateurs de l'événement. |
| `DELETE` | `/messages/:id` | Supprime un message et ses commentaires. | Auteur du message, administrateurs du groupe ou organisateurs de l'événement. |
| `DELETE` | `/threads/:id` | Supprime un fil, ses messages et leurs commentaires. | Organisateurs de l'événement, ou administrateurs du groupe. |

## 6. Albums photo

Cahier des charges 2.5.

**Règles :**
- Un album photo est associé à 1 événement.
- Un album contient 0 ou plusieurs photos. Chaque photo est postée par 1 participant de l'événement (ou un organisateur).
- Les photos peuvent être commentées par les participants de l'événement.

Une photo est enregistrée par son adresse (URL). Les commentaires de photos se modifient et se suppriment avec les routes `/comments/:id` du dossier Fils de discussion.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events/:id/albums` | Crée un album photo dans un événement. | Participants et organisateurs de l'événement. |
| `GET` | `/events/:id/albums` | Liste les albums d'un événement, du plus récent au plus ancien. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `GET` | `/albums/:id` | Renvoie un album et son nombre de photos. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `PUT` | `/albums/:id` | Modifie le nom ou la description d'un album. | Créateur de l'album ou organisateurs de l'événement. |
| `POST` | `/albums/:id/photos` | Ajoute une photo dans un album. | Participants et organisateurs de l'événement. |
| `GET` | `/albums/:id/photos` | Liste les photos d'un album, de la plus récente à la plus ancienne, avec le profil public de leur auteur. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `GET` | `/photos/:id` | Renvoie une photo avec le profil public de son auteur. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `PUT` | `/photos/:id` | Modifie l'adresse ou la légende d'une photo. | Auteur de la photo. |
| `POST` | `/photos/:id/comments` | Ajoute un commentaire sous une photo. | Participants et organisateurs de l'événement. |
| `GET` | `/photos/:id/comments` | Liste les commentaires d'une photo, du plus ancien au plus récent. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `DELETE` | `/photos/:id` | Supprime une photo et ses commentaires. | Auteur de la photo ou organisateurs de l'événement. |
| `DELETE` | `/albums/:id` | Supprime un album, ses photos et leurs commentaires. | Créateur de l'album ou organisateurs de l'événement. |

## 7. Sondages

Cahier des charges 2.6.

**Règles :**
- Un événement peut avoir 0 ou plusieurs sondages, créés par un organisateur.
- Un sondage comporte 1 ou plusieurs questions.
- Chaque question propose plusieurs réponses possibles (au moins deux), mais une seule peut être choisie.
- Chaque participant répond au sondage en choisissant sa réponse pour chaque question.

Un participant répond une seule fois à un sondage. Il peut ensuite modifier ou retirer sa réponse.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events/:id/polls` | Crée un sondage avec ses questions et leurs réponses possibles. | Organisateurs de l'événement. |
| `GET` | `/events/:id/polls` | Liste les sondages d'un événement, du plus récent au plus ancien. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `GET` | `/polls/:id` | Renvoie un sondage avec ses questions, le nombre de personnes qui ont répondu (`responsesCount`) et si le demandeur a déjà répondu (`hasResponded`). | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `PUT` | `/polls/:id` | Modifie le titre ou les questions d'un sondage. | Organisateurs de l'événement. |
| `POST` | `/polls/:id/responses` | Enregistre la réponse de l'utilisateur connecté. | Participants et organisateurs de l'événement. |
| `GET` | `/polls/:id/responses/me` | Renvoie la réponse de l'utilisateur connecté à ce sondage. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `PUT` | `/polls/:id/responses/me` | Remplace la réponse de l'utilisateur connecté. | Participant qui a déjà répondu. |
| `GET` | `/polls/:id/responses` | Liste la réponse détaillée de chaque participant, avec son profil public. | Organisateurs de l'événement. |
| `GET` | `/polls/:id/results` | Endpoint spécifique. | Utilisateur connecté qui a le droit de voir l'événement (événement public, ou personne invitée si l'événement est privé). |
| `DELETE` | `/polls/:id/responses/me` | Supprime la réponse de l'utilisateur connecté. | Participant qui a déjà répondu. |
| `DELETE` | `/polls/:id` | Supprime un sondage et toutes les réponses des participants. | Organisateurs de l'événement. |

## 8. Billetterie

Cahier des charges 2.7.

**Règles :**
- Seul un événement public peut avoir une billetterie.
- Un organisateur crée 1 ou plusieurs types de billets. Un type de billet contient un nom, un montant et une quantité limitée.
- Une personne extérieure peut obtenir 1 seul billet par événement.
- Pour chaque billet acheté, on enregistre le type de billet, le nom, le prénom, l'adresse complète de la personne et la date d'achat.

**Personne extérieure :** elle n'a pas de compte. Les routes qui lui servent sont donc publiques : voir les billets en vente et obtenir un billet. Les autres routes sont réservées aux organisateurs.

**Un seul billet par personne :** comme une personne extérieure n'a pas de compte, elle est reconnue par son nom, son prénom et son adresse. La comparaison ignore les majuscules, les accents et les espaces en trop.

**Quantité limitée :** la réservation d'une place est une opération atomique dans la base. Même si plusieurs achats arrivent au même instant, il n'est jamais vendu plus de billets que la quantité prévue.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events/:id/ticket-types` | Crée un type de billet pour un événement public. | Organisateurs de l'événement. |
| `GET` | `/events/:id/ticket-types` | Liste les types de billets d'un événement public, du moins cher au plus cher, avec le nombre de billets restants. | Public. Aucun token nécessaire. |
| `GET` | `/ticket-types/:id` | Renvoie un type de billet avec le nombre de billets vendus et restants. | Public. Aucun token nécessaire. |
| `PUT` | `/ticket-types/:id` | Modifie le nom, le montant ou la quantité d'un type de billet. | Organisateurs de l'événement. |
| `POST` | `/events/:id/tickets` | Une personne extérieure obtient un billet pour un événement public. | Public. Aucun token nécessaire. |
| `GET` | `/events/:id/tickets` | Liste les billets vendus pour l'événement, du plus récent au plus ancien, avec leur type. | Organisateurs de l'événement. |
| `GET` | `/tickets/:id` | Renvoie un billet avec son type, les données de la personne et la date d'achat. | Organisateurs de l'événement. |
| `PUT` | `/tickets/:id` | Corrige les données de la personne sur un billet, par exemple une faute dans l'adresse. | Organisateurs de l'événement. |
| `DELETE` | `/ticket-types/:id` | Supprime un type de billet. | Organisateurs de l'événement. |
| `DELETE` | `/tickets/:id` | Supprime un billet. | Organisateurs de l'événement. |

## 9. Shopping list

Cahier des charges 2.8.

Quand la shopping list est activée sur un événement, un utilisateur indique ce qu'il va apporter : un nom, une quantité et son heure d'arrivée à l'événement.

**Règles :**
- La shopping list doit être activée par un organisateur (`shoppingListEnabled: true` sur l'événement). Sinon, ces routes renvoient une erreur 409.
- Chaque chose apportée est unique par événement. La comparaison du nom ignore les majuscules, les accents et les espaces en trop : "Chips" et "chips" sont la même chose.
- Seuls les participants et les organisateurs de l'événement utilisent la shopping list.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events/:id/shopping-items` | L'utilisateur connecté indique ce qu'il apporte à l'événement. | Participants et organisateurs de l'événement. |
| `GET` | `/events/:id/shopping-items` | Liste ce que chacun apporte à l'événement, trié par heure d'arrivée, avec le profil public de la personne. | Participants et organisateurs de l'événement. |
| `GET` | `/shopping-items/:id` | Renvoie un élément de la shopping list. | Participants et organisateurs de l'événement. |
| `PUT` | `/shopping-items/:id` | Modifie le nom, la quantité ou l'heure d'arrivée. | Personne qui apporte l'élément. |
| `DELETE` | `/shopping-items/:id` | Retire un élément de la shopping list. | Personne qui apporte l'élément, ou organisateurs de l'événement. |

## 10. Covoiturage (bonus)

Cahier des charges 3 (bonus).

Quand le covoiturage est activé sur un événement, un utilisateur indique qu'il s'y rend en voiture : lieu de départ, heure de départ, prix proposé, nombre de places disponibles et temps maximum d'écart.

**Temps maximum d'écart** (`maxDetourMinutes`) : le détour que le conducteur accepte pour prendre des passagers, en minutes. Exemple du cahier des charges : sur un trajet de 2h30, un écart de 30 minutes donne un trajet maximum de 3h.

**Règles :**
- Le covoiturage doit être activé par un organisateur (`carpoolingEnabled: true` sur l'événement). Sinon, ces routes renvoient une erreur 409.
- Seuls les participants et les organisateurs de l'événement proposent et consultent les covoiturages.
- Un utilisateur propose un seul covoiturage par événement.

| Méthode | Route | Rôle | Accès |
|---|---|---|---|
| `POST` | `/events/:id/carpools` | L'utilisateur connecté indique qu'il se rend à l'événement en voiture. | Participants et organisateurs de l'événement. |
| `GET` | `/events/:id/carpools` | Liste les covoiturages proposés pour l'événement, triés par heure de départ, avec le profil public du conducteur. | Participants et organisateurs de l'événement. |
| `GET` | `/carpools/:id` | Renvoie un covoiturage avec le profil public du conducteur. | Participants et organisateurs de l'événement. |
| `PUT` | `/carpools/:id` | Modifie les informations d'un covoiturage. | Conducteur du covoiturage. |
| `DELETE` | `/carpools/:id` | Supprime un covoiturage. | Conducteur du covoiturage, ou organisateurs de l'événement. |
