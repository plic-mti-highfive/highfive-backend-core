# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2026-10-06

### Added

- **Messagerie** (`modules/conversations/`, 13 routes) — detail, choix et
  verifications dans `docs/MESSAGERIE.md` :
  - conversations directes (une seule par paire), groupes de 3 a 50, et
    canaux de projet, miroirs de leur equipe sans plafond (R-MSG3) ;
  - messages texte, modification par l'auteur sans limite de temps
    (R-MSG5), suppression qui laisse
    « Message supprime » (R-MSG6), demandes de message (R-MSG7) ;
    pagination par curseur keyset, plus recents d'abord ;
  - pieces jointes : projet ou fichier de projet, apercu resolu selon ce
    que chaque lecteur a le droit de voir (R-MSG4) ;
  - medias deposes — image, video, fichier — en stockage prive, lus par URL
    signee ; type reel verifie, SVG et executables refuses (R-MSG8) ;
  - gestion des groupes : renommer, ajouter, retirer (administrateur),
    quitter (R-MSG9) ;
  - notifications `message_received` regroupees par conversation, eteintes
    a la lecture ; signalement d'un message par un participant.
- Evenements `project.team-changed` / `project.deleted`
  (`common/events/`), emis par Projets, Equipe et Administration.
- Entretien periodique : purge des depots de messages orphelins (24 h),
  rattrapage des canaux de projet.
- Seed : conversations de demonstration.

### Changed

- Contrat recopie du front : R-MSG8 et R-MSG9 ajoutees, 89 operations ;
  R-MSG5 n'a plus de fenetre de 15 minutes.
- Limitation de debit comptee par personne connectee, par IP a defaut ;
  limites dediees sur l'envoi de messages, les depots et l'ouverture de
  conversations.
- `notifyMany` traite tous les destinataires en lot (22 ms au lieu de
  280 ms pour un canal de 60 personnes).
- `detectMimeType` reconnait MP4/MOV/HEIC/M4A (boite `ftyp`) et WebM.
- La regle de visibilite d'un projet est une fonction unique
  (`canViewWith`), partagee par `assertCanView` et sa version par lot.

### Fixed

- Les erreurs 413 (depot trop gros) et 429 (trop de requetes) avaient un
  message anglais ; elles sont desormais en francais, comme toutes les
  autres.

## [2.0.1] - 2026-09-16

### Fixed

- `/api/docs` affichait des schemas non resolus. `components.schemas` ne
  contient que des renvois `./schemas/*.json` vers le bundle exporte depuis le
  front, mais ce dossier n'avait jamais ete copie ici et Swagger UI, qui
  tourne dans le navigateur, aurait de toute facon cherche ces fichiers sur
  une route que l'API ne sert pas. Les 94 schemas sont desormais presents,
  copies dans l'image, et resolus au chargement pour que le document servi
  soit autonome.
- Le bundle reprend `WallToTasksInput` dans sa forme reelle (`elements`), et
  non l'ancien `elementIds`.

## [2.0.0] - 2026-09-16

### Refonte v2 — le backend suit le contrat du front

L'ancien `src/` a ete entierement remplace. Le contrat publie par
`highfive-frontend` (`docs/v2/`) fait desormais autorite. Detail complet,
justifications et ecarts assumes : `docs/REFACTO-V2.md`.

### Added
- Les 77 routes du contrat v2, **sauf la messagerie** : auth, personnes,
  themes, projets, highfives, equipe/demandes/invitations, annonces,
  commentaires, Les Taches, Le Mur, fichiers, notifications, recherche et fil,
  administration.
- `src/contracts/` : copie conforme des schemas zod du front, qui valident
  desormais tous les corps de requete.
- Sessions porteur avec expiration reelle (table `sessions`, jeton stocke
  hache), mots de passe en argon2, jetons de reinitialisation a usage unique.
- Frontiere IA explicite (`src/common/ai/`) : jobs BullMQ vers le service IA et
  lecture des recommandations, avec repli deterministe systematique.
- Travaux d'entretien periodiques : archivage a 180 jours (R-PR6), expiration
  des invitations (R-I1), purge et anonymisation a 30 jours (R-X3/R-P2).
- `POST /reports` (creation de signalement), sans quoi la file de moderation
  serait vide par construction.
- Trois routes du Mur hors contrat front, conservees : session collaborative,
  suggestion de taches par l'IA, acceptation des taches suggerees.
- Declaration des comptes d'administration par `ADMIN_EMAILS` : le role
  plateforme ne s'obtient par aucune route, et la liste fait autorite dans les
  deux sens (promotion au demarrage et a l'inscription, retrogradation au
  retrait).
- Creation du seau de stockage au demarrage, et ouverture en lecture anonyme
  des seuls prefixes servis publiquement (`avatars/`, `projects/`) — plus
  d'etape manuelle avant la premiere utilisation.
- `scripts/seed.mjs` (jeu de demonstration), `scripts/smoke.mjs` (~200
  verifications de bout en bout, avec rapport de couverture : une route servie
  jamais appelee fait echouer le script) et `scripts/smoke-integration.mjs`
  (chaine complete du Mur avec un vrai client Yjs, et files du service IA).
- `pnpm check:contract` : detection de derive entre les controleurs et
  `openapi.yaml`, branchee dans l'integration continue.
- `docs/REFACTO-V2.md` et `docs/CANVAS.md` (inventaire des fonctions du Mur).

### Changed
- `openapi.yaml` est le contrat du front, copie tel quel et servi sur
  `/api/docs` — la documentation n'est plus reconstruite depuis des decorateurs.
- Toutes les routes sont prefixees `/api`.
- Une seule forme d'erreur : `{ code, message, details? }`, message en francais
  affichable directement par le front.
- Un module par domaine du contrat, a la place du decoupage en bounded contexts.
- Sonde de sante deplacee sur `/api/health`.

### Removed
- **Multi-tenance** : `tenants`, `X-Tenant-ID`, `TenantGuard`,
  `TenantMiddleware`, colonnes `tenant_id`.
- **`@plic-mti-highfive/shared-types`** et, avec lui, `.npmrc`, le
  `registry-url` de la CI et le secret `github_token` de la construction
  d'image.
- `tickets` (et checklists, commentaires de ticket), `project-messages`,
  `project-followers`, `skills`, `user-connections`, `showcase`, `discovery`.
- JWT access/refresh et passport, remplaces par des sessions revocables.
- `class-validator` / `class-transformer`, remplaces par zod.
- `Interactions.md`, remplace par `archi.md` (racine) et `docs/REFACTO-V2.md`.

### Fixed
- R-PR1 est revalidee sur l'etat resultant d'un `PATCH`, et non sur le seul
  corps recu : la regle n'est plus contournable en deux requetes.
- R-M1 (un seul porteur) est garantie par un index unique partiel, et le
  transfert de propriete est transactionnel.
- R-A2 (une seule annonce epinglee) est garantie par un index unique partiel.
- R-F2 : le type reel du fichier est detecte a partir de son contenu, et non
  de l'extension ou du `Content-Type` annonce.
- `PATCH /projects/{slug}` avec des besoins echouait en erreur serveur : la
  cascade sur la relation faisait reecrire par l'ORM les lignes que le
  remplacement venait de supprimer, avec un `project_id` nul. Les colonnes
  simples et chaque relation sont desormais ecrites separement.
- `POST /me/avatar` repondait 201 la ou le contrat attend 200.
