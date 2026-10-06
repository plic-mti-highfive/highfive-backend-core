# HighFive! — Core Backend

API REST NestJS de la plateforme HighFive! : projets, equipes, Le Lab (Le Mur
et Les Taches), fil de decouverte, notifications, moderation.

Les 89 operations du contrat sont servies. La messagerie est servie (texte,
projet ou fichier de projet en piece jointe, images, videos et fichiers
deposes), avec ses notifications, la moderation des messages et les canaux
de projet (`docs/MESSAGERIE.md`).

Le contrat est celui du front (`highfive-frontend`, `docs/v2/`) : ce depot
l'implemente, il ne le definit pas. Voir **`docs/REFACTO-V2.md`** pour ce qui a
change, ce qui est volontairement absent, et les ecarts assumes.

## Prerequis

- Node.js >= 22, pnpm >= 9
- Docker et Docker Compose (PostgreSQL, Redis, MinIO en developpement)

## Demarrage

```bash
pnpm install
cp .env.example .env          # puis ajuster
docker compose up -d db redis minio
pnpm start:dev
```

L'API ecoute sur `http://localhost:3000/api`, la documentation sur
`http://localhost:3000/api/docs` (le contrat `openapi.yaml`, servi tel quel).

En developpement, le schema de base est synchronise au demarrage
(`synchronize: true`) et les 24 themes sont semes automatiquement.

### Jeu de demonstration

```bash
node scripts/seed.mjs   # 5 personnes, 5 projets, highfives et equipes
```

Compte de demonstration : `alex.rivera@example.com` / `demo1234`.

### Verification de bout en bout

```bash
pnpm check:contract          # derive du contrat, sans rien demarrer
pnpm smoke                   # ~200 verifications + rapport de couverture des routes
pnpm smoke:integration       # chaine complete du Mur, et files du service IA
```

`pnpm smoke` echoue si **une seule** route servie n'est exercee par aucun
scenario. Ce que ces scripts ne couvrent pas est liste dans `scripts/README.md`.

### Administration

Le role `admin` ne s'obtient par aucune route — un role plateforme ne doit pas
pouvoir se donner par l'API. Il se declare dans `ADMIN_EMAILS` (adresses
separees par des virgules), relu au demarrage **et** a l'inscription. La liste
fait autorite dans les deux sens : un compte retire redevient membre au
redemarrage suivant.

### Stockage objet

Rien a preparer a la main : le seau est cree au demarrage s'il manque, et
ouvert en lecture anonyme sur les deux prefixes servis publiquement
(`avatars/`, `projects/`) — le contrat rend ces URL directement lisibles.

## Scripts

| Commande | Role |
| --- | --- |
| `pnpm start:dev` | Developpement, rechargement a chaud |
| `pnpm build` / `pnpm start:prod` | Production |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` | ESLint (avec `--fix`) |
| `pnpm test` | Tests unitaires (Vitest) |

## Arborescence

```
src/
  contracts/   schemas zod — copie conforme de src/domain/ du front
  entities/    entites TypeORM, une par table
  common/      config, base, erreurs, pagination, auth, stockage, IA, mappers
  modules/     un module par domaine du contrat
    auth/ users/ tags/ projects/ highfives/ memberships/ announcements/
    comments/ tasks/ wall/ files/ notifications/ search/ admin/ maintenance/
docs/
  REFACTO-V2.md  ce qui change, ce qui manque, pourquoi
  CANVAS.md      inventaire des fonctions du Mur
openapi.yaml     le contrat, servi sur /api/docs
```

## Services voisins

| Service | Depot | Lien avec le core |
| --- | --- | --- |
| Front | `highfive-frontend` | Consomme l'API. Definit le contrat. |
| Le Mur | `highfive-backend-canvas` | Le core signe les jetons d'acces et appelle `/export`. Voir `docs/CANVAS.md`. |
| IA | `highfive-backend-ai` | Le core publie des jobs BullMQ et lit les recommandations. **Ce depot n'est pas modifie par le core.** |

## Points a connaitre

- **Authentification** : jeton porteur opaque, table `sessions`, expiration
  reelle. `POST /auth/logout` invalide le jeton cote serveur.
- **Validation** : les corps sont valides par les memes schemas zod que le
  front (`src/contracts/`). Ne jamais reimplementer une regle de forme ici.
- **Erreurs** : une seule forme, `{ code, message, details? }`, message en
  francais affichable directement.
- **Messagerie** : conversations directes, groupes et canaux de projet,
  pieces jointes et medias (stockage prive, URL signees). Choix et limites :
  `docs/MESSAGERIE.md`.
- **Limitation de debit** : comptee par personne connectee (par IP a
  defaut), 200 requetes par minute et par route ; plus strict sur l'envoi
  de messages (60), les depots et l'ouverture de conversations (20).
