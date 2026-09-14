# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
