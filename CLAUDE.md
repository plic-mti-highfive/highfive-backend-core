# HighFive! — Core Backend (NestJS)

## Contexte

Backend principal de **HighFive!** : API REST NestJS, PostgreSQL. Depuis la
refonte v2, il est ecrit **a partir du front** — le contrat publie par le depot
`highfive-frontend` (`docs/v2/`) fait autorite. Voir `docs/REFACTO-V2.md`.

Plus de multi-tenance : la plateforme est mono-instance.

### Dans le perimetre

- Les 89 routes du contrat v2, messagerie comprise (13 routes, voir
  `docs/MESSAGERIE.md`), plus
  6 routes hors contrat : sante (2), Le Mur (3, voir `docs/CANVAS.md`) et
  creation de signalement.
- Droits, regles metier (R-xx), persistance.
- Emission du jeton d'acces au service canvas (Le Mur).
- Frontiere vers le service IA : files BullMQ + lecture des recommandations.

### Hors perimetre (services separes)

- Le document collaboratif du Mur (Yjs/Hocuspocus) → `highfive-backend-canvas`.
- Embeddings et recommandation → `highfive-backend-ai` (**a ne pas modifier**).
- Le front → `highfive-frontend`.

## Stack

- NestJS 11, TypeScript, Node 22
- TypeORM + PostgreSQL
- **zod** pour toute validation d'entree (`src/contracts/`), pas class-validator
- Sessions : jeton opaque + table `sessions`, argon2 pour les mots de passe
- BullMQ (Redis) vers le service IA
- Stockage objet S3/MinIO
- Documentation : `openapi.yaml` servi tel quel sur `/api/docs`

## Arborescence

```
src/
  contracts/   schemas zod, copie conforme de src/domain/ du front — ne jamais
               modifier ici sans modifier d'abord cote front
  entities/    entites TypeORM (une par table)
  common/      config, base, erreurs (ApiError), pagination, auth (garde +
               sessions), stockage, frontiere IA, mappers entite -> contrat
  modules/     un module par domaine du contrat : auth, users, tags, projects,
               highfives, memberships, announcements, comments, tasks, wall,
               files, notifications, conversations, search,
               admin, maintenance
```

## Conventions

- **Un module = un domaine du contrat front.** Pas de « bounded contexts ».
- Fichiers en kebab-case, classes en PascalCase.
- Toute erreur passe par `ApiError` : `{ code, message, details? }`, message en
  francais, affichable tel quel (le front ne le retraduit pas).
- Un champ optionnel du contrat se rend `undefined`, **jamais `null`** : les
  schemas zod du front refusent `null` la ou ils acceptent l'absence.
- Les corps sont valides par `@ZodBody(schema)`, jamais par une reimplementation.
- Pas de `any` : le lint echoue. Typer, ou `unknown` + affinage.
- Tout champ derive (`highfiveCount`, `membersCount`, `unreadCount`...) est
  calcule serveur et jamais accepte en entree (R-X2).
- Les commentaires expliquent **pourquoi**, pas quoi.

## Commandes

```bash
pnpm start:dev                  # developpement (watch)
pnpm build && pnpm start:prod   # production
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # eslint --fix
docker compose up -d db redis   # dependances locales
node scripts/seed.mjs           # jeu de demonstration
node scripts/smoke.mjs          # parcours de bout en bout (~75 verifications)
```

## Documentation

| Fichier | Contenu |
| --- | --- |
| `docs/REFACTO-V2.md` | Ce qui a ete supprime et pourquoi, ce qui est implemente, la frontiere IA, les ecarts assumes. |
| `docs/MESSAGERIE.md` | La messagerie : etapes, choix retenus, verifications, decisions ouvertes. |
| `docs/CANVAS.md` | Inventaire des fonctions du Mur : celles servies au front, celles conservees sans ecran. |
| `Database.md` | Modele relationnel, table par table. |
| `openapi.yaml` | Le contrat, copie depuis le front. Servi sur `/api/docs`. |
