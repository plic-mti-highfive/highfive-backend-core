# Interactions — core_backend

Ce document recense toutes les interactions **entrantes** (services externes → core_backend) et **sortantes** (core_backend → services externes). Pour la vue d'ensemble plateforme et la description des autres repos (canvas, ml, shared-types, frontend), voir `../archi.md`.

Services externes concernés :
- **frontend** (React) — consommateur principal de l'API REST.
- **canvas_backend** (Hocuspocus/Yjs) — service Ideation séparé.
- **ml_service** (FastAPI) — moteur Discovery & Matchmaking séparé.
- **shared-types** (`@plic-mti-highfive/shared-types`) — dépendance npm, pas un service runtime.

---

## 1. Flux entrants (inbound)

### 1.1. frontend → core_backend (REST + JWT)

Toutes les routes REST de l'API (`/auth`, `/users`, `/projects`, `/tickets`, `/project-members`, `/project-messages`, `/user-profiles`, `/skills`, `/user-connections`, …).

- **Transport :** HTTPS (Nginx reverse proxy → NestJS).
- **Auth :** `Authorization: Bearer <access_token>` (JWT court) + refresh token sur `/auth/refresh`.
- **Multi-tenancy :** header obligatoire `X-Tenant-ID` résolu par `TenantMiddleware` + `TenantGuard`.
- **Rate limiting :** `@nestjs/throttler` (100 req / 60s par défaut).
- **Validation :** `class-validator` sur tous les DTO.

### 1.2. canvas_backend → core_backend (flux de transition Ideation → Project Execution)

Quand une session d'idéation aboutit, le canvas appelle le core pour matérialiser le projet.

- **Appel :** `POST /projects` (+ éventuellement `POST /tickets` pour seed initial) avec le JWT du User Owner.
- **Payload :** `CreateProjectDto` (name, description, visibility initiale, …).
- **Responsabilité :** une fois `201 Created` retourné, le cycle de vie du projet appartient exclusivement au core_backend. Le canvas ne conserve pas d'état projet.
- **Auth :** même JWT que celui du frontend ; `X-Tenant-ID` obligatoire.

### 1.3. canvas_backend → core_backend (vérification de droits / autorisation session canvas)

Avant d'ouvrir une room Yjs, le canvas valide que le User a bien accès au projet côté core.

- **Appel :** vérification du JWT + lookup `GET /projects/:id/members/:userId` (ou endpoint dédié type `/canvas-sessions/authorize`).
- **Retour attendu :** rôle canvas à encoder dans `CanvasTokenPayload` (`admin | editor | viewer`) — mapping depuis `project_role_enum`.

### 1.4. ml_service → core_backend (récupération de contexte pour calculs)

Lorsqu'il recalcule des recommandations, `ml_service` peut interroger le core pour enrichir son contexte (profils, skills, projets actifs).

- **Appels :** endpoints REST read-only (`GET /users/:id/profile`, `GET /skills`, `GET /projects?status=ACTIVE`, …).
- **Auth :** token de service (machine-to-machine) — à définir, distinct des JWT utilisateur.
- **Criticité :** non-bloquant pour l'UX utilisateur (le ML traite en arrière-plan).

---

## 2. Flux sortants (outbound)

### 2.1. Domain events émis (Pub/Sub — actuellement `EventEmitter2` in-process, cible BullMQ/Redis)

Events déclarés dans `src/discovery/events/` et écoutés par `DiscoveryService` (stub in-process). À terme, ces events seront poussés sur Redis/BullMQ et consommés par `ml_service` et `showcase` (si externalisé).

| Event | Émis par | Payload | Consommateurs prévus |
|---|---|---|---|
| `profile.updated` | `UserProfilesService` (`src/identity/user-profiles/user-profiles.service.ts:38`) | `{ userId, tenantId, changes }` | ml_service (recompute recommandations) |
| `ticket.created` | `TicketsService` (`src/project-execution/tickets/tickets.service.ts:52`) | `{ ticketId, projectId, tenantId }` | ml_service (signaux besoins/compétences) |
| `ticket.updated` | `TicketsService` (`src/project-execution/tickets/tickets.service.ts:113`) | `{ ticketId, projectId, tenantId, changes }` | ml_service |
| `project.visibility.changed` | `ProjectsService` (`src/project-execution/projects/projects.service.ts:82`) | `{ projectId, tenantId, oldVisibility, newVisibility }` | showcase (refresh vitrine publique), ml_service |

**Invariants :**
- Tous les events portent `tenantId` (aucun consommateur ne doit agréger cross-tenant).
- Émission non-bloquante : un échec downstream ne doit jamais faire échouer l'opération métier qui a produit l'event.

### 2.2. core_backend → canvas_backend (émission de tokens de session canvas)

Quand le frontend demande à ouvrir une room Yjs, le core signe un `CanvasTokenPayload` (défini dans `highfive-shared-types`) que le frontend présente ensuite au canvas.

- **Endpoint émetteur :** `POST /canvas-sessions` (ou équivalent) sur le core.
- **Payload signé :** `{ userId, tenantId, projectId, role: 'admin' | 'editor' | 'viewer' }`.
- **Signature :** JWT signé avec un secret partagé core ↔ canvas.
- **Mapping des rôles :** `project_role_enum` → rôle canvas (OWNER/ADMIN → `admin`, MEMBER → `editor`, VIEWER → `viewer`).

### 2.3. core_backend → ml_service (lecture de recommandations)

Lorsque le frontend demande des recommandations, le core relaie la requête vers `ml_service`.

- **Appel :** REST interne (`GET {ml_service_url}/recommendations?userId=…&tenantId=…`).
- **Auth :** token de service machine-to-machine.
- **Fallback :** si ml_service indisponible, retourner une liste vide avec header indiquant la dégradation (jamais d'erreur 5xx au frontend).

---

## 3. Dépendances statiques (build-time)

### 3.1. `@plic-mti-highfive/shared-types`

Package npm privé (GitHub Packages) consommé au build. Source unique des enums, interfaces et payloads partagés entre core, canvas et frontend.

- **Types consommés côté core :** `UserStatus`, `ProjectStatus`, `ProjectVisibility`, `ProjectRole`, `TicketStatus`, `ConnectionStatus`, `CanvasTokenPayload`, `UserContext`.
- **Règle :** toute modification d'un enum DB ou d'un payload d'event cross-service doit passer par une bump de version dans `highfive-shared-types` avant d'être adoptée ici.
- **Config locale :** voir `highfive-shared-types/README.md` (PAT GitHub + `.npmrc`).

---

## 4. Récapitulatif visuel

```
                          ┌───────────────────────────┐
                          │         frontend          │
                          └───┬─────────────────┬─────┘
                              │ REST + JWT      │ WebSocket
                              ▼                 ▼
      ┌───────────────────────────────┐   ┌────────────────────┐
      │         core_backend          │<──│   canvas_backend   │
      │  (Identity, Project Exec,     │   │   (Ideation/Yjs)   │
      │   Showcase, Discovery stubs)  │──>│                    │
      └──┬────────────────────────┬───┘   └────────────────────┘
         │ events (pub/sub)       │ REST m2m
         ▼                        ▼
   ┌──────────────────┐    ┌──────────────────┐
   │    ml_service    │───>│   core_backend   │  (lookups profils/skills)
   │ (Discovery core) │    └──────────────────┘
   └──────────────────┘
```
