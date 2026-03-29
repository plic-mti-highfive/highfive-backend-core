# HighFive! — Core Backend (NestJS)

## Contexte projet

Plateforme **HighFive!** multi-tenant (une instance par école). Ce repo contient uniquement le **backend core** (NestJS/TypeScript, API REST, PostgreSQL).

### Ce qui est IN scope

- API REST NestJS + logique métier + persistance Postgres
- Auth (JWT, argon2), multi-tenancy, CRUD projets/tickets/membres
- Domain events + préparation queues BullMQ (stubs)
- Swagger, validation class-validator, guards, interceptors

### Ce qui est OUT of scope (ne PAS implémenter)

- Canvas temps réel (Yjs/Hocuspocus) — service séparé
- ML/recommandation (FastAPI) — service séparé
- Frontend

### Bounded Contexts (DDD)

1. **Identity & Tenancy** — auth, tenants, users, profils, skills, connexions
2. **Project Execution** — projets, membres, tickets, messages
3. **Showcase & Community** — stubs minimaux (publication/visibilité)
4. **Discovery & Matchmaking** — interfaces/events stubs uniquement (contrat d'intégration ML)

## Stack technique

- **Runtime**: NestJS 11, TypeScript, Node.js
- **ORM**: TypeORM (choix assumé — repository pattern, migrations)
- **DB**: PostgreSQL
- **Auth**: JWT (access + refresh tokens), argon2 pour hash passwords
- **Validation**: class-validator + class-transformer
- **Docs API**: @nestjs/swagger
- **Async/Jobs**: BullMQ (Redis) — préparation stubs
- **Sécurité**: helmet, CORS, rate limiting (@nestjs/throttler)
- **Infra**: Nginx reverse proxy, Redis, Postgres

## Multi-tenancy

- Résolution tenant via header `X-Tenant-ID` (plus flexible que Host pour dev/staging)
- TenantGuard global injecte `tenantId` dans la request
- Tous les repositories filtrent par `tenant_id`
- Aucune requête ne traverse les tenants

## Conventions

- Structure par bounded context : `src/identity/`, `src/project-execution/`, etc.
- Sous-dossiers par module : `controllers/`, `services/`, `entities/`, `dto/`, `repositories/`
- Fichiers : kebab-case (`user-profile.entity.ts`)
- Classes : PascalCase (`UserProfileEntity`, `CreateProjectDto`)
- Tests unitaires : `*.spec.ts` co-localisés
- Tests e2e : `test/` à la racine

## Commandes utiles

```bash
npm run start:dev    # Dev avec watch
npm run test         # Tests unitaires
npm run test:e2e     # Tests e2e
npm run build        # Build production
```

## Base de données

### Enums
- `user_status_enum`: PENDING, ACTIVE, SUSPENDED
- `project_status_enum`: DRAFT, ACTIVE, ARCHIVED
- `project_visibility_enum`: PUBLIC, PRIVATE, INVITATION_ONLY
- `project_role_enum`: OWNER, ADMIN, MEMBER, VIEWER
- `ticket_status_enum`: TODO, IN_PROGRESS, IN_REVIEW, DONE
- `connection_status_enum`: PENDING, ACCEPTED, BLOCKED

### Tables principales
**Identity & Tenancy**: tenants, users, user_profiles, skills, user_skills, user_connections
**Project Execution**: projects, project_members, project_followers, tickets, project_messages
