# Messagerie — plan d'implementation

Lot suivant de la refonte v2 (voir `REFACTO-V2.md` §3) : conversations
privees entre deux personnes, groupes, canaux de projet, avec texte et pieces
jointes. Le travail est decoupe en etapes livrables une a une ; chacune se
termine par une verification.

## Suivi

| # | Etape | Statut |
| --- | --- | --- |
| 1 | Fondations : contrat, entites, module vide | Fait |
| 2 | Conversations directes et groupes (3 routes) | Fait |
| 3 | Messages texte (5 routes) | Fait |
| 4 | Pieces jointes du contrat actuel (projet, fichier de projet) | Fait |
| 5 | Medias : images, videos, fichiers libres (extension du contrat) | Fait |
| 6 | Notifications et moderation | Fait |
| 7 | Canaux de projet (R-MSG3) | Fait |
| 8 | Gestion des groupes (extension du contrat) | Fait |
| 9 | Finitions et documentation | Fait (sauf migration, voir ci-dessous) |
| — | Branchement du front | Plus tard |

## Point de depart

- Le contrat existe deja cote front : 8 routes (`API-ROUTES.md`), schemas zod
  (`src/domain/conversation.ts`), modele de tables propose (`SPEC.md` §2 :
  `conversations`, `conversation_participants`, `messages`). `openapi.yaml`
  porte deja ces routes ; `scripts/smoke.mjs` et `scripts/contract-diff.mjs`
  les listent comme « non servies ».
- Trois types de conversation : `direct` (2 personnes), `group` (3 a 50),
  `channel` (miroir automatique de l'equipe d'un projet).
- Regles metier : R-MSG1 a R-MSG7 (`SPEC.md` §3 « Messagerie »).
- Pas de temps reel : le front fait du polling (`SPEC.md` §5). Ne pas ajouter
  de websocket tant qu'aucune route front ne l'attend.
- Regle du depot : **un schema ne se modifie ici qu'apres l'avoir ete cote
  front.**

## Ecarts entre le besoin et le contrat actuel

1. **Pieces jointes.** Le contrat ne connait que `{kind: "project",
   projectId}` et `{kind: "file", fileId}`, ou `fileId` designe un fichier
   **deja depose dans un projet** (`project_files`). Il manque :
   - une route pour deposer un fichier propre a une conversation ;
   - la video (R-F2 n'autorise qu'images, PDF, audio, archives) ;
   - une URL et un `mimeType` dans `attachmentPreview`, sans lesquels le
     front ne peut ni afficher une image ni lire une video ;
   - un message sans texte : `body` est `min(1)`, une image seule est
     impossible.
2. **Groupes.** Le contrat permet de les creer, pas de les renommer, d'y
   ajouter ou retirer quelqu'un, ni de les quitter.
3. **Front.** `MessageInput` n'a aucune interface de piece jointe ;
   `listMessages` ne charge que la premiere page (20 messages), sans
   pagination ni polling, et le mock renvoie les plus anciens d'abord.

Ces extensions sont isolees dans les etapes 5 et 8. Les etapes 1 a 4, 6 et 7
implementent le contrat tel quel.

---

## Etape 1 — Fondations

- `src/contracts/conversation.ts` : copie conforme de
  `highfive-frontend/src/domain/conversation.ts`, exportee par
  `contracts/index.ts`.
- Entites (`src/entities/`) :
  - `ConversationEntity` — `type`, `project_id` (unique quand
    `type = 'channel'`), `title`, `direct_key` (paire d'identifiants triee,
    unique : une seule conversation directe par paire), `last_activity_at`
    (dernier message ou creation : cache de tri, jamais expose).
  - `ConversationParticipantEntity` — PK `(conversation_id, user_id)`,
    `last_read_at`, `joined_at`.
  - `MessageEntity` — `body`, `attachment_kind` / `attachment_project_id` /
    `attachment_file_id`, `sent_at`, `edited_at`, `deleted` ; index
    `(conversation_id, sent_at)`.
- Module `modules/conversations/` (module, controleur, service), enregistre
  dans `app.module.ts`.
- Mappers `toConversation` et `toMessage` dans `common/mappers`.
- `Database.md` a jour.
- Verification : `pnpm typecheck`, `pnpm lint`, `pnpm test`, schema
  synchronise au demarrage.
- **Fait.** `typecheck`, `lint`, `test` (dont `toConversation` / `toMessage`)
  et `check:contract` passent ; au demarrage contre Postgres, la
  synchronisation cree les trois tables avec leurs index partiels et leurs
  contraintes `CHECK`.

## Etape 2 — Conversations directes et groupes

- `POST /conversations` : participants dedoublonnes, createur inclus ; 2 =
  `direct`, 3 a 50 = `group` (R-MSG1/2) ; participants existants et actifs ;
  une conversation directe deja existante entre les deux est reutilisee (le
  mock en cree une nouvelle) ; premier message cree dans la meme
  transaction.
- `GET /conversations` : `ConversationSummary[]` tries par dernier message ;
  `unreadCount` via `last_read_at` (sans ses propres messages) ;
  `isMessageRequest` (R-MSG7) calcule a la lecture ; `participants` et
  `lastMessage` resolus. Requetes groupees, pas de N+1.
- `GET /conversations/:id` : 404 si l'appelant n'est pas participant (on ne
  revele pas l'existence).
- Verification : Vitest sur les regles, scenarios dans `smoke.mjs`.
- **Fait.** Choix retenus :
  - **Une conversation directe par paire** (`direct_key` unique). Un
    `POST /conversations` vers quelqu'un qu'on a deja contacte ajoute le
    message au fil existant et le renvoie (201). Deux premiers messages
    simultanes aboutissent au meme fil (`ON CONFLICT DO NOTHING`).
  - **Destinataire inconnu, suspendu ou supprime : 400**, avec le meme
    message — son etat n'est pas revele, comme dans la recherche. Un auteur
    suspendu recoit 403 (meme regle que R-C2).
  - Le titre d'une conversation directe est ignore (R-MSG1) ; celui d'un
    groupe est optionnel.
  - **Un message supprime ne compte pas dans `unreadCount`** (le mock le
    compte) : il n'y a plus rien a lire.
  - R-MSG7 : demande = conversation directe ou la personne n'a encore rien
    ecrit. Repondre (y compris par `POST /conversations`) la leve.
  - Identifiant mal forme : 400 (`ParseUUIDPipe`, comme le reste de l'API).
- Verifie : 27 scenarios dans `smoke.mjs` (+2 dans le bloc suspension),
  reponses validees par les schemas zod du front, et un nombre de requetes
  SQL constant pour `GET /conversations` (10, authentification comprise,
  avec 2 comme avec 18 conversations).

## Etape 3 — Messages texte

- `GET /conversations/:id/messages` : pagination ; `readBy[]` recalcule
  (participants dont `last_read_at >= sent_at`, plus l'auteur) ; auteur
  resolu, y compris un compte anonymise (R-P2). Ordre et pagination : voir
  ci-dessous.
- `POST /conversations/:id/messages` : met a jour `last_activity_at` et le
  `last_read_at` de l'auteur.
- `PATCH /messages/:id` : auteur seul (R-MSG5), corps valide par
  zod.
- `DELETE /messages/:id` : `deleted = true`, `body = ''`, jamais de `DELETE`
  SQL (R-MSG6).
- `POST /conversations/:id/read` : `last_read_at = now()`, 204.
- Retirer les 8 routes des listes « non servies » de `smoke.mjs` et
  `contract-diff.mjs`.
- Verification : `pnpm check:contract`, `pnpm smoke`.
- **Fait.** Les 84 operations du contrat sont servies. Choix retenus :
  - **Pagination** : la premiere page porte les 20 messages **les plus
    recents**, chaque page dans l'ordre chronologique ; `nextCursor` remonte
    vers les plus anciens. C'est ce que l'ecran actuel affiche tel quel (le
    plus ancien en haut, defilement vers le bas) — le mock servait les plus
    anciens d'abord, ce qui cachait la fin de toute conversation de plus de
    20 messages. Curseur **keyset** `(sent_at, id)`
    (`conversations/message-cursor.ts`) : il ne glisse pas quand un message
    arrive pendant qu'on remonte le fil. `sent_at` et `last_read_at` passent
    en `timestamptz(3)`, la precision d'une `Date` JavaScript, pour que la
    comparaison soit exacte.
  - **`readBy`** : l'auteur, plus tout participant dont `last_read_at` est
    posterieur a l'envoi. Ecrire dans une conversation vaut lecture de tout
    ce qui precede.
  - **Droits** : message d'autrui, ou d'une conversation dont on n'est pas
    participant -> 404 (comme les conversations). Un compte suspendu lit,
    marque comme lu et supprime ses messages, mais n'ecrit ni ne modifie
    (403).
  - **R-MSG5** : modifier un message supprime -> 403.
  - **R-MSG5 revue apres l'etape 9 (decision produit)** : la fenetre de 15
    minutes du contrat d'origine est supprimee, cote front d'abord
    (`SPEC.md`, `openapi.yaml`, bulle et mock) — l'auteur modifie son
    message a tout moment ; `editedAt` le signale. Consequence pour la
    moderation : un message signale peut etre reecrit avant d'etre lu par
    l'administration, comme il peut deja etre supprime (decision ouverte
    n°5).
  - **R-MSG6** : suppression idempotente (204 a chaque fois) ; elle vide
    aussi la piece jointe.
  - `PATCH /messages/:id` valide son corps par
    `messageCreateInputSchema.pick({ body })` : `MessageBodyUpdateInput` est
    anonyme cote front.
  - Pieces jointes refusees (400) jusqu'a l'etape 4 — levee depuis.
- Verifie : 34 scenarios de plus dans `smoke.mjs` (dont la stabilite du
  curseur quand un message arrive entre deux pages), 9 tests unitaires
  (curseur ; la fenetre de modification, testee alors, a ete retiree
  depuis), reponses validees par les schemas zod
  du front.

## Etape 4 — Pieces jointes du contrat actuel (R-MSG4)

- A l'envoi : l'auteur doit pouvoir voir le projet
  (`ProjectAccessService.assertCanView`) ; le fichier doit exister et etre
  visible.
- `attachmentPreview` resolu a la lecture, par lot. Cible supprimee ou
  devenue privee : le message reste, l'apercu est absent.
- Verification : smoke avec un projet prive partage a un non-membre.
- **Fait.** `MessageAttachmentsService` (`conversations/`). Choix retenus :
  - **A l'envoi** : l'auteur doit pouvoir voir le projet joint, ou le projet
    du fichier joint (R-F4). Sinon 400 — introuvable et invisible donnent le
    meme message, pour ne pas sonder l'existence d'un projet prive. 400 et
    non 404, que le contrat reserve ici a la conversation.
  - **A la lecture**, l'apercu est resolu **pour chaque lecteur** : joindre
    un projet prive a un non-membre lui transmet le message et la reference
    (`attachment`), jamais le titre ni l'accroche (`attachmentPreview`
    absent). Meme chose si le projet est supprime, devient prive, ou si le
    fichier est supprime.
  - La regle de visibilite d'un projet est desormais une fonction unique,
    `canViewWith` (`projects/project-access.service.ts`), partagee par
    `assertCanView` et par `visibleIds` (version par lot, une requete).
  - Resolution par lot : au plus quatre requetes de plus par page, quel que
    soit le nombre de pieces jointes.
- Verifie : 15 scenarios dans `smoke.mjs` (projet public, projet prive vu
  d'un non-membre, sondage d'un projet invisible, fichier public, fichier
  d'un projet invisible, fichier supprime, suppression du message), tests
  de `canViewWith`, apercus valides par le schema zod du front.
- **Manque du contrat, a traiter avec l'etape 5** : ni `ProjectFile` ni
  l'apercu de fichier ne portent d'URL, et aucune route ne telecharge un
  fichier de projet. Un fichier joint s'affiche (nom, taille) mais ne
  s'ouvre pas.

## Etape 5 — Medias (extension du contrat, front d'abord)

- Front (`src/domain/conversation.ts`, puis `pnpm export:schemas`) : nouveau
  `kind: "upload"` (`attachmentId`) ; apercu `{kind: "upload", attachmentId,
  fileName, fileSize, mimeType, url}` ; `body` optionnel quand une piece
  jointe est presente ; nouvelle route dans `openapi.yaml`.
- Backend : table `message_attachments` (deposant, conversation,
  `storage_key`, type, taille, `message_id` nullable) ;
  `POST /conversations/:id/attachments` (multipart) — depot en deux temps,
  le message reste un corps JSON valide par zod ; stockage sous
  `messages/<conversationId>/`, **non public**, URL presignees courtes ;
  signatures video dans `detectMimeType` (MP4/MOV `ftyp` au decalage 4,
  WebM `1A45DFA3`) ; limites dediees (ex. 10 Mo image, 50 Mo video) ; purge
  par `maintenance/` des depots jamais rattaches.
- Verification : tests de `detectMimeType` (video, executable deguise),
  smoke depot -> envoi -> URL lisible par un participant seulement.
- **Fait.** Contrat modifie cote front d'abord (`highfive-frontend`), puis
  recopie ici (`src/contracts/conversation.ts`, `openapi.yaml`, `schemas/`).
  Nouvelle regle **R-MSG8**, documentee dans `SPEC.md` et `API-ROUTES.md` du
  front. Le contrat compte desormais 85 operations.
  - **Contrat** : `kind: "upload"` (`uploadId`) dans `MessageAttachment` ;
    apercu `{kind: "upload", uploadId, fileName, fileSize, mimeType, url}` ;
    `body` facultatif des qu'une piece jointe est la (`refine`) ;
    `MessageBodyUpdateInput` devient un schema exporte (il etait anonyme) ;
    `MessageUpload` (reponse du depot) ; `lastMessage.attachmentKind` dans
    `ConversationSummary`, pour qu'un message sans texte s'annonce dans la
    liste.
  - **Front, au-dela du contrat** : le mock MSW sert la nouvelle route ;
    `uploadMessageAttachment` dans `src/api/conversations.ts` ; la bulle
    affiche une image, un lecteur video ou un lien de telechargement selon
    `mimeType` ; la liste affiche « Piece jointe » pour un message sans
    texte. **Pas encore** de bouton de depot dans `MessageInput`, ni de hook
    TanStack Query : c'est le branchement du front.
  - **Backend** : table `message_uploads` ; `messages.attachment_upload_id`
    (unique : un depot ne se joint qu'a un message) ;
    `POST /conversations/:id/attachments`, multipart `file`. Un depot ne se
    joint que par son auteur, dans sa conversation, une seule fois — sinon
    400, meme reponse qu'un depot inexistant. Deux envois simultanes du meme
    depot : l'index unique tranche, le second recoit le meme 400.
  - **Types** : type reel detecte (MP4/MOV/HEIC/M4A par la boite `ftyp` au
    decalage 4, WebM par sa signature EBML) ; familles des fichiers de
    projet plus la video ; **SVG refuse** (il peut porter du script) ;
    executables refuses. Plafonds : 10 Mo image, 50 Mo video, 20 Mo autre
    (`messages.*` dans `configuration.ts`). Multer coupe la lecture au-dela
    de 50 Mo ; le 413 qui en resulte a desormais un message en francais
    (`api-exception.filter.ts`, valable pour toute l'API).
  - **Stockage** : prefixe `messages/<conversationId>/`, hors de la lecture
    publique ; `url` signee pour une heure, recalculee a chaque lecture, sur
    l'adresse publique du stockage (`MINIO_PUBLIC_ENDPOINT`) — la signature
    couvre l'hote.
  - **Cycle de vie** : supprimer le message supprime le depot (ligne et
    objet) ; un depot jamais joint est purge apres 24 h par l'entretien
    periodique.
  - Les contraintes `CHECK` n'ont plus de nom explicite : TypeORM ne les
    compare que par leur nom, et une regle modifiee sous le meme nom n'etait
    pas appliquee par la synchronisation (constate a cette etape).
- Verifie : 20 scenarios dans `smoke.mjs` (dont la lecture reelle du fichier
  par l'URL signee, le refus sans signature, et le fichier supprime avec son
  message), 5 tests unitaires de plus (`detectMimeType`, mapper), la
  contrainte `CHECK` sondee en base sur six combinaisons, la purge des
  orphelins (7 purges, un depot rattache conserve), reponses validees par
  les schemas zod du front. Front : `pnpm check` vert (dont 4 tests de
  R-MSG8 sur les schemas).
- Reste ouvert : l'apercu d'un **fichier de projet** (`kind: "file"`) n'a
  toujours pas d'URL — R-F4 rend publics les fichiers d'un projet public,
  mais le contrat ne l'expose pas. A trancher avec le front.

## Etape 6 — Notifications et moderation

- Chaque message emet `message_received` vers les autres participants ;
  regroupement R-N2 par conversation (`target_id` = conversation) — une
  notification non lue gagne un acteur.
- Cible `message` resolue dans `notifications.service.ts` (`conversationId`,
  `conversationTitle`).
- Apercu d'un signalement de message dans `admin.service.ts`.
- Verification : deux messages successifs = une notification a deux
  acteurs.
- **Fait.** Choix retenus :
  - **Cible = la conversation** (comme le mock) : tant qu'elle n'est pas
    lue, une conversation active donne une seule notification, enrichie de
    ses auteurs (« Alice et 2 autres t'ont envoye un message »).
    `conversationTitle` : titre du groupe, ou du projet pour un canal ;
    absent pour une conversation directe.
  - **Lire eteint** : `POST /conversations/:id/read` marque lues les
    notifications de la conversation, et ecrire dans une conversation
    eteint aussi les siennes (on vient de la lire). Le message suivant ouvre
    une nouvelle notification (`NotificationsService.markTargetRead`).
  - Une notification vers une conversation dont on ne fait plus partie est
    ecartee de la liste (R-N3 : pas de lien qui mene a un 404).
  - Une conversation directe en attente (R-MSG7) notifie aussi : c'est ce
    qui fait connaitre la demande.
  - **Signalement** : un message ne se signale que par un participant de sa
    conversation ; sinon 404, meme reponse qu'un message inexistant (pas de
    sondage par identifiant). Un message supprime n'est plus signalable.
  - **Apercu de moderation** : l'auteur et un extrait du seul message
    signale, jamais le reste de la conversation ; tronque a 1000 caracteres
    (borne de `ReportTargetPreview`, un message en fait 4000) ; un message
    sans texte s'annonce par sa piece jointe (« [Fichier joint : photo.png] »).
- Verifie : 12 scenarios dans `smoke.mjs` (regroupement a deux acteurs,
  titre, extinction a la lecture et a l'ecriture, nouvelle notification
  apres lecture, signalements refuses et accepte, apercu et traitement par
  l'administration), 4 tests de `messageExcerpt`, notifications et apercu
  valides par les schemas zod du front.
- **Non fait, faute de support** : le courriel (`message_received` a
  `email` dans ses canaux par defaut, et doc 04 §14 prevoit un rappel apres
  24 h de non-lu) — aucun envoi de courriel n'existe dans le backend.
- **Questions ouvertes** (voir « Decisions ouvertes ») : preuve d'un message
  supprime apres signalement ; moderation des images.

## Etape 7 — Canaux de projet (R-MSG3)

- Canal cree avec le projet, supprime avec lui (`projects.service` `create`
  / `remove`, `admin.deleteProject`).
- Participants synchronises a chaque changement d'appartenance : demande ou
  invitation acceptee, exclusion, depart, blocage, transfert. Un
  `ChannelSyncService` appele dans les memes transactions (ou
  `@nestjs/event-emitter`, deja installe).
- Rattrapage des projets existants.
- Verification : rejoindre un projet -> present dans le canal ; en etre
  retire -> le canal disparait de la liste.
- **Fait.** Choix retenus :
  - **Evenements plutot qu'appels directs** : la messagerie depend deja des
    projets ; l'inverse aurait ferme une boucle entre modules. Projets,
    Equipe et Administration emettent `project.team-changed` et
    `project.deleted` (`common/events/project-events.ts`, via
    `@nestjs/event-emitter`, en `emitAsync` : la synchronisation est faite
    quand la requete repond, et son echec est journalise sans faire echouer
    l'action sur l'equipe).
  - **Synchronisation complete et idempotente** (`ChannelsService.sync`) :
    le canal est recalcule a partir des appartenances non bloquees, quel
    que soit l'evenement. Emis a la creation du projet, aux demandes
    acceptees (y compris automatiquement, projet ouvert), aux invitations
    acceptees, a l'exclusion, au blocage, au depart et au transfert.
  - **Rattrapage** dans l'entretien periodique (`reconcileAll`) : cree les
    canaux des projets anterieurs a la messagerie, realigne ceux qui ont
    derive, supprime ceux dont le projet a disparu.
  - **Porteur seul** : le canal existe mais n'est pas liste (et son detail
    repond 404) tant qu'il n'a qu'un participant — le contrat exige au moins
    deux personnes par conversation.
  - **Arrivee** : l'historique est lisible, mais la lecture part de
    l'arrivee (pas de centaines de non lus en rejoignant une equipe).
  - **Depart, exclusion, blocage** : sortie du canal, plus d'acces a
    l'historique ; les observateurs sont dans le canal (« miroir exact »).
  - **Suppression du projet** : le canal disparait avec ses messages, ses
    fichiers (stockage compris) et les notifications qui y renvoyaient.
  - **Projet archive** : canal inchange, toujours accessible en ecriture.
  - **Plafond** : contrat modifie cote front — `participantIds` n'a plus de
    maximum ; R-MSG2 (groupe : 50 au plus) devient une regle propre aux
    groupes (`GROUP_MAX_PARTICIPANTS`). Les groupes restent plafonnes a 50.
- Verifie : 18 scenarios dans `smoke.mjs` (canal masque du porteur seul,
  apparition a la premiere arrivee, nom du projet, notification titree,
  invitation, observateur, historique lisible mais non compte, exclusion,
  depart, suppression du projet et de ses notifications) ; en base, apres
  le smoke, chaque canal est exactement l'equipe non bloquee (29 projets,
  aucun ecart) ; blocage et transfert verifies a part ; rattrapage verifie
  en effacant tous les canaux et en laissant un canal sur un projet
  supprime ; un canal de 60 personnes passe le schema du front, et un
  message y part en 280 ms, notifications comprises.
- Limite connue : les notifications partent une par une (~4,5 ms par
  personne). Sans consequence a cette echelle, a regrouper pour des
  equipes de plusieurs centaines de personnes (voir etape 9).

## Etape 8 — Gestion des groupes (extension du contrat, front d'abord)

- `PATCH /conversations/:id` (titre), `POST` / `DELETE
  /conversations/:id/participants`, quitter un groupe.
- A fixer : qui peut ajouter ou retirer, sort d'un groupe sous 3 personnes.
- Refuse sur `direct` et `channel`.
- **Fait.** Regle **R-MSG9**, ajoutee au contrat cote front (`SPEC.md`,
  `API-ROUTES.md`, `openapi.yaml`, schemas `ConversationUpdateInput` et
  `ConversationParticipantsAddInput`, champ `adminId`), puis recopiee ici.
  Le contrat compte 89 operations.
  - **Droits (decision produit)** : le createur administre le groupe. Tout
    participant renomme, ajoute des personnes et quitte ; seul
    l'administrateur retire quelqu'un. S'il part, le plus ancien
    participant restant prend le role (a egalite d'anciennete — les
    participants de la creation —, le plus petit identifiant).
  - Routes : `PATCH /conversations/:id` (titre),
    `POST /conversations/:id/participants` (200, `ConversationDetail`),
    `DELETE /conversations/:id/participants/:userId` (administrateur,
    204 ; se retirer soi-meme -> 400, c'est `leave`),
    `POST /conversations/:id/leave` (204, sur le modele de
    `POST /projects/:slug/leave`).
  - Conversation directe ou canal : 403, avec un message qui dit pourquoi
    (R-MSG1 : reste a deux ; R-MSG3 : se gere depuis le projet).
  - Ajout : personnes actives seulement (meme 400 qu'a la creation),
    deja presentes ignorees, plafond de 50 (R-MSG2) verifie sous verrou
    de la ligne du groupe — deux ajouts simultanes ne le depassent pas.
    Qui arrive lit l'historique, sans qu'il compte comme non lu.
  - Depart et retrait : plus d'acces a la conversation ni a ses
    notifications. Un groupe a une personne n'est plus liste ; vide, il est
    efface (messages, fichiers, notifications — helper partage
    `delete-conversation.ts`, aussi utilise par les canaux).
  - Un compte suspendu peut quitter un groupe (ce n'est pas ecrire), pas le
    renommer, y ajouter ni en retirer quelqu'un.
  - `admin_id` sans contrainte en base : un groupe cree avant la regle n'en
    a pas, et la lecture retombe sur le plus ancien participant ; son
    premier depart d'administrateur l'enregistre.
  - **Front, au-dela du contrat** : le mock MSW sert les quatre routes,
    `src/api/conversations.ts` expose `renameConversation`,
    `addConversationParticipants`, `removeConversationParticipant`,
    `leaveConversation`. Aucun ecran ne les appelle encore.
  - Non fait : messages systeme (« Alice a ajoute Bob ») — absents du
    contrat ; le fil ne garde pas trace des arrivees et departs.
- Verifie : 25 scenarios dans `smoke.mjs` (droits de chacun, refus sur
  direct et canal, arrivee sans non lus, retrait, succession de
  l'administrateur, groupe a une personne masque puis efface), plafond de
  50 verifie a part (49e et 50e acceptes, 51e refuse), effacement constate
  en base, reponse avec `adminId` validee par le schema zod du front, un
  test unitaire de plus (administrateur par defaut).

## Etape 9 — Finitions et documentation

- `README.md`, `REFACTO-V2.md` §3, `scripts/README.md`, `CHANGELOG.md`,
  version 2.1.0.
- Migration TypeORM pour la production (le developpement est en
  `synchronize`).
  A y inclure : le remplissage de `conversations.admin_id` pour les groupes
  existants, et le remplacement des contraintes `CHECK` nommees de l'etape 1
  par leurs versions sans nom (etape 5).
- Conversations dans `seed.mjs`.
- Limitation de debit sur l'envoi (`@nestjs/throttler`).
- Notifications d'un message : `notifyMany` traite les destinataires un par
  un (~5 requetes chacun, ~4,5 ms). 280 ms pour un canal de 60 personnes ;
  les canaux n'ayant plus de plafond, a regrouper (preferences, acteur et
  notifications existantes lus en une fois) avant des equipes de plusieurs
  centaines de personnes.
- **Fait**, sauf la migration :
  - **Migration : non faite, et pas propre a la messagerie.** Le projet n'a
    aucune infrastructure de migration : l'image Docker demarre en
    `NODE_ENV=production`, ou la synchronisation est coupee, et aucune
    migration ne cree le schema — l'infra force donc `NODE_ENV=development`,
    et toute la base (pas seulement la messagerie) vit de la
    synchronisation. Une migration de la seule messagerie n'aurait personne
    pour la jouer. Mettre en place les migrations est une decision de
    projet (migration initiale de tout le schema, `migrationsRun` au
    demarrage, `synchronize` coupe partout). Le jour venu, y inclure le
    remplissage de `conversations.admin_id` et le remplacement des `CHECK`
    nommees.
  - **Seed** (`scripts/seed.mjs`) : deux conversations directes repondues,
    une demande de message (R-MSG7), le groupe « Chorale du mardi » et un
    premier message dans le canal de la fresque — alignes sur
    `src/mocks/data/conversations.ts` du front. Idempotent : relance sans
    rien dupliquer (verifie).
  - **Limitation de debit** : 60 messages, 20 depots et 20 conversations
    ouvertes par minute et par personne. Le garde global
    (`UserThrottlerGuard`) compte desormais **par personne connectee**, par
    IP a defaut — sans quoi tout un reseau d'ecole sorti par une seule IP
    partagerait une limite. Change le comptage pour toute l'API (plus
    permissif par reseau, pareil par personne). Le 429 a un message en
    francais. Verifie : le 61e message est refuse, une autre personne sur la
    meme IP passe.
  - **Notifications en lot** : `notifyMany` lit preferences, acteur et
    notifications ouvertes en trois requetes pour tous les destinataires,
    puis ecrit ensemble. Message dans un canal de 60 : **22 ms au lieu de
    280 ms** ; regroupement R-N2 inchange (verifie). Profite aussi aux autres
    appelants de `notifyMany` (equipe, annonces...).
  - Version 2.1.0, `CHANGELOG.md`, `README.md`, `REFACTO-V2.md`,
    `CLAUDE.md`, `scripts/README.md` a jour ; `CHANGELOG.md` du front
    (section « Non publie »).

## Plus tard — branchement du front

- `VITE_API_MODE=http`.
- Front : `useInfiniteQuery` pour les messages, `refetchInterval`, interface
  de piece jointe dans `MessageInput`.
- Temps reel (SSE ou websocket) : seulement ensuite, si le besoin est
  confirme.

## Decisions ouvertes

1. ~~Medias (etape 5)~~ : tranche — contrat modifie cote front.
2. ~~Gestion des groupes (etape 8)~~ : faite, createur administrateur.
3. ~~Canaux de projet (etape 7)~~ : faits, plafond leve pour les canaux
   seulement (les groupes restent a 50).
4. ~~Conversation directe unique par paire~~ : retenu (etape 2).
5. **Preuve apres signalement** : supprimer un message (R-MSG6) vide son
   texte et supprime son fichier, y compris s'il est signale — l'auteur peut
   donc effacer ce qu'on lui reproche avant que l'administration ne le lise.
   Depuis que R-MSG5 n'a plus de limite de temps, il peut aussi le reecrire.
   Option : conserver le contenu d'un message signale (invisible des
   participants) jusqu'au traitement du signalement.
6. **Moderation des images** : `ReportTargetPreview` n'a pas d'URL ;
   l'administration voit « [Fichier joint : photo.png] » sans pouvoir
   l'ouvrir. Demanderait d'etendre le contrat (`ReportTargetPreview.url`).
7. **Action d'administration sur un message** : `AdminActionType` connait
   `hide_comment`, rien pour un message. Traiter le signalement n'agit donc
   pas sur le message lui-meme.
