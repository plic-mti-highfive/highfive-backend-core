# Cahier de tests — core backend

Ce document recense les tests du depot `highfive-backend-core`, par module,
avec leur type, leur fichier et leur statut. Il est tenu a jour a chaque
ajout de test (tache T10 : audit de couverture, infrastructure d'integration,
tests des parties sensibles).

Legende des statuts : ✅ existant avant T10 — 🆕 ajoute par T10 — 🐞 revele un
bug (test `it.fails`, voir « Bugs reveles »).

## 1. Types de tests

| Type | Ou | Ce que ca couvre | Dependances |
| --- | --- | --- | --- |
| Unitaire | `src/**/*.spec.ts` | Fonctions pures, services avec depots simules, SDK `openai` simule. Rapide (< 10 s). | Aucune (ni base, ni docker) |
| Integration | `test/integration/**/*.int-spec.ts` | L'application Nest **reelle** (`AppModule`), requetes HTTP (`supertest`), vraie base PostgreSQL et vrai Redis. | Docker (local) ou services CI |
| Smoke | `scripts/smoke.mjs`, `scripts/smoke-integration.mjs` | Parcours de bout en bout (~380 verifications) contre une API demarree ; chaine du Mur avec un vrai client Yjs. | API + MinIO (+ canvas, Redis) |

## 2. Lancer les tests

```bash
pnpm test                 # unitaires (vitest.config.ts), sans docker
pnpm test:int             # integration (vitest.integration.config.ts), bases jetables
pnpm test:int:coverage    # idem avec couverture (dossier coverage-int/)
pnpm test:coverage        # unitaires avec couverture (dossier coverage/)
pnpm smoke                # parcours bout en bout, API deja demarree
```

Si `pnpm <script>` echoue avec `ERR_PNPM_IGNORED_BUILDS` (pnpm 11), appeler
directement `./node_modules/.bin/vitest run [-c vitest.integration.config.ts]`.

## 3. Strategie des bases jetables

Les tests d'integration **ne touchent jamais une base existante** (ni
`infra-db-1`, ni `highfive_dev`).

1. `test/integration/global-setup.ts` (une fois par run) :
   - si `TEST_DATABASE_URL` (URL d'un compte PostgreSQL pouvant creer des
     bases) **et** `TEST_REDIS_URL` sont definies (CI), il les utilise ;
   - sinon il demarre via la CLI docker un `postgres:16-alpine` (donnees en
     `tmpfs`) et un `redis:7-alpine` sur un port aleatoire de `127.0.0.1`,
     nommes `hf-core-test-*`, attend qu'ils repondent, et les supprime en fin
     de run (`docker rm -f`), meme en cas d'echec.
2. `createTestApp()` (`test/integration/helpers/create-test-app.ts`, une fois
   par **fichier** de test) : cree la base `hf_test_<aleatoire>`, y construit
   le schema (`synchronize`, car le `DatabaseModule` ne synchronise qu'en
   developpement), demarre le vrai `AppModule` et supprime la base a la fin
   (`DROP DATABASE ... WITH (FORCE)`). Isolation totale entre fichiers.
3. Remplaces par des fakes : stockage objet (`StorageService`), client HTTP du
   canvas (`CanvasClientService`, export configurable), lecture HTTP des
   recommandations IA (`AiRecommendationsService`). `LLM_PROVIDER=fake`. La
   limitation de debit est relevee. Redis est reel et partage entre fichiers
   (les files BullMQ ne sont pas consommees par les parcours testes).
4. Compilation par SWC (`unplugin-swc`) : esbuild n'emet pas
   `emitDecoratorMetadata`, indispensable a l'injection de Nest.

Helpers (`test/integration/helpers/api.ts`) : `registerUser`, `login`,
`authHeader`, `createProject` (`publish: true` pour l'activer), `addMember`
(invitation acceptee), `firstColumnId`. Le compte administrateur est celui de
`ADMIN_EMAILS` (`registerUser(t, { admin: true })`).

CI : le job `test` de `.github/workflows/pipeline.yml` declare des `services:`
postgres et redis (jetables, avec healthchecks) et execute `pnpm exec vitest
run -c vitest.integration.config.ts` apres les unitaires, avec un rapport JUnit
distinct (`junit-integration.xml`).

## 4. Tests par module

### Authentification (`CORE-AUTH`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-AUTH-01 | Inscription : session renvoyee, email normalise, aucun hash ni mot de passe expose | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-02 | Mot de passe stocke en argon2, jamais en clair | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-03 | Inscription : corps invalides (email, mot de passe court, pseudo) → 400 `validation_error` en francais avec `details` | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-04 | Doublon d'email (casse ignoree) → 409 ; doublon de pseudo → 409 | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-05 | Connexion valide (casse de l'email ignoree) | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-06 | Mauvais mot de passe / compte inconnu → 401 au message unique « Adresse ou mot de passe incorrect. » | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-07 | Compte supprime : connexion refusee, jeton existant invalide | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-08 | Jeton stocke hache (`sha256(pepper:jeton)`), jamais en clair | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-09 | `GET /me` renvoie la session courante | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-10 | Deconnexion : 204, jeton invalide cote serveur (401), ligne supprimee ; autres sessions intactes | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-11 | Jeton inconnu ou schema d'en-tete non `Bearer` → 401 | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-12 | Jeton expire → 401 et ligne purgee | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-13 | Reinitialisation : 204 que l'adresse existe ou non (pas d'enumeration) | Integration | `test/integration/auth.int-spec.ts` | 🆕 |
| CORE-AUTH-14 | Reinitialisation : jeton inconnu/expire → 400 ; jeton valide change le mot de passe, ferme les sessions, usage unique | Integration | `test/integration/auth.int-spec.ts` | 🆕 |

### AuthGuard, roles et format d'erreur (`CORE-GUARD`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-GUARD-01 | Routes publiques accessibles sans jeton (`/tags`, `/projects`) | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-02 | Routes protegees sans jeton → 401 `unauthorized` | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-03 | Route publique : le lecteur connecte est reconnu (projet prive 403 anonyme / 200 porteur) | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-04 | `/admin/*` : anonyme 401, membre 403 (message FR), admin 200 | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-05 | `ADMIN_EMAILS` fait autorite ; aucune route ne donne le role admin | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-06 | Erreurs au format `ApiError` : 404 route/projet, JSON invalide 400, details zod | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-07 | Identifiant non UUID → 400 `validation_error` | Integration | `test/integration/auth-guard.int-spec.ts` | 🆕 |
| CORE-GUARD-08 | Identifiant non UUID : message en francais (attendu) | Integration | `test/integration/auth-guard.int-spec.ts` | 🐞 |

### Projets (`CORE-PROJ`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-PROJ-01 | Regle de visibilite `canViewWith` (brouillon, prive, admin) | Unitaire | `src/modules/projects/project-access.spec.ts` | ✅ |
| CORE-PROJ-02 | `slugify` (accents, ponctuation, longueur) | Unitaire | `src/modules/projects/slug.spec.ts` | ✅ |
| CORE-PROJ-03 | Lecture de la personnalisation, cartes, `PATCH /projects/:slug` (D6) | Unitaire | `src/modules/projects/customization-reader.spec.ts` | ✅ |
| CORE-PROJ-04 | Creation : 401 anonyme, brouillon dont l'auteur est porteur, 3 colonnes, Mur cree | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-05 | R-PR1 : prive + participation ouverte → 400 ; theme inconnu → 400 FR | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-06 | Compte suspendu : creation refusee (403) | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-07 | Slug unique : suffixes `-1`, `-2` pour les titres identiques | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-08 | Brouillon : 404 pour tiers et anonyme, 200 porteur et admin, absent du fil | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-09 | Projet prive : 403 non-membre/anonyme, 200 equipe et admin, absent du fil | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-10 | Archive : lisible par lien mais sorti du fil public | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-11 | Modification : porteur et co-porteur oui ; membre 403, inconnu 403, anonyme 401 | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-12 | R-PR1 revalidee sur l'etat resultant (422) ; `highfiveCount` non modifiable | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-13 | Transitions : cycle complet, conflits 409, droits (porteur seul pour publier/archiver), transition inconnue 400 | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-14 | Suppression : titre exact exige (400), porteur seul (403), 204 puis 404, admin autorise | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-15 | Transfert : ancien porteur → co-porteur ; non-porteur 403 ; vers soi-meme 400 ; vers un non-membre | Integration | `test/integration/projects.int-spec.ts` | 🆕 |
| CORE-PROJ-16 | Transfert vers une personne inexistante → 404 (attendu) | Integration | `test/integration/projects.int-spec.ts` | 🐞 |

### Equipes : candidatures, invitations, roles (`CORE-MEMB`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-MEMB-01 | Candidature : `open` accepte d'emblee, `on_request` met en attente, `on_invite` refuse (403) | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-02 | Pas de doublon : demande en attente / deja membre → 409 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-03 | Projet prive ferme au non-membre (403), anonyme 401, compte suspendu 403 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-04 | Acceptation par le porteur → membre ; seconde decision 409 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-05 | Seuls porteur/co-porteurs traitent les demandes (403 membre, inconnu) | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-06 | Refus : personne ajoutee ; re-demande bloquee 30 jours (R-D2) | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-07 | Demande inconnue → 404 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-08 | Quitter : membre oui (puis re-demande), porteur 403 (R-M3) | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-09 | Changement de role : porteur seul ; `owner` refuse (400) ; porteur non retrogradable ; cible hors equipe 404 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-10 | Exclusion : co-porteur oui, membre non, porteur intouchable ; id non UUID 400 | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-11 | Blocage : perte de role, retour impossible (403), blocage hors equipe, porteur non bloquable, invitation refusee | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-12 | Invitation acceptee → role propose ; destinataire seul (404 sinon) ; reponse definitive (409) | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |
| CORE-MEMB-13 | Invitation expiree → 409 ; doublons (en cours, deja dans l'equipe) → 409 ; droits ; role `owner` refuse | Integration | `test/integration/memberships.int-spec.ts` | 🆕 |

### Taches et colonnes (`CORE-TASK`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-TASK-01 | Creation par un membre/porteur ; observateur 403, inconnu 403, anonyme 401 | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-02 | Titre vide 400, colonne inexistante 404 (message FR) | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-03 | R-K5 : assignation a un membre ; non-membre ou bloque refuse (400) sans rien creer ; revalidee a la mise a jour | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-04 | Mise a jour (titre, echeance retiree avec `null`) | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-05 | Modifier/deplacer/supprimer interdits a l'observateur et a l'inconnu | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-06 | Deplacement entre colonnes (renumerotation) ; colonne d'un autre projet 400 | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-07 | Suppression 204 puis 404 | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-08 | Lecture publique d'un projet public ; projet prive 403 hors equipe | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-09 | Colonnes : creation reservee aux co-porteurs, maximum 6 (R-K2) | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-10 | Suppression de colonne : destination obligatoire, taches deplacees, droits, derniere colonne protegee (R-K3) | Integration | `test/integration/tasks.int-spec.ts` | 🆕 |
| CORE-TASK-11 | Mapping `toTask` (champs optionnels, jamais `null`) | Unitaire | `src/common/mappers/index.spec.ts` | ✅ |

### Le Mur (`CORE-WALL`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-WALL-01 | `wall/session` : jeton canvas signe, role projete (porteur/co-porteur `admin`, membre `editor`, observateur `viewer`), claims verifies | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-02 | Jeton canvas invalide avec un autre secret ; `canvasId` stable | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-03 | Non-membre refuse meme sur projet public (403, R-W1), anonyme 401, projet inconnu 404, brouillon, personne bloquee | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-04 | Metadonnees du Mur : observateur oui, inconnu 403 | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-05 | Conversion en taches (R-W2) : premiere colonne, `wallOriginId`, libelle vide generique ; observateur/inconnu 403 | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-06 | Suggestions : Mur injoignable ou sans texte → vide ; OPENAI_TOKEN absent → 503 FR ; droits membres | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-07 | Creation des taches retenues parmi les propositions | Integration | `test/integration/wall.int-spec.ts` | 🆕 |
| CORE-WALL-08 | Client canvas : export avec secret interne, refus/injoignable → `null`, injection du chat → `true`/`false` | Unitaire | `src/modules/wall/canvas-client.service.spec.ts` | 🆕 |
| CORE-WALL-09 | Generation de taches : prompt construit depuis le Mur, filtrage des propositions, 503 sur reponse vide/illisible/echec | Unitaire | `src/modules/wall/ai-tasks.service.spec.ts` | 🆕 |

### Commentaires (`CORE-COM`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-COM-01 | Un visiteur connecte commente un projet public ; liste publique | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-02 | Anonyme 401 ; corps vide/trop long 400 | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-03 | Projet prive : commentable par l'equipe seule (403 sinon) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-04 | Compte suspendu : 403 (R-C2) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-05 | Un seul niveau de reponse (R-C4) ; parent inconnu/autre projet 404 | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-06 | Masquer : porteur, co-porteur, admin ; membre et visiteur 403 ; commentaire retire de la liste | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-07 | Suppression reelle reservee a l'administration (R-C3) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-COM-08 | Personne bloquee : ne commente plus, ses commentaires disparaissent (R-V8) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |

### Highfives (`CORE-HF`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-HF-01 | Donner incremente le compteur ; redonner est idempotent (une seule ligne, R-H1) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-HF-02 | Compteur de la fiche suivi ; retirer idempotent | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-HF-03 | Le porteur ne highfive pas son projet (403, R-H2) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-HF-04 | Anonyme 401 ; projet prive 403 ; brouillon d'autrui 404 | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |
| CORE-HF-05 | Liste publique paginee, reflete les retraits (R-H3) | Integration | `test/integration/comments-highfives.int-spec.ts` | 🆕 |

### Messagerie et Mur : chat et assistant (`CORE-CHAT`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-CHAT-01 | Declencheur `@ia` et reponse de l'assistant | Unitaire | `src/modules/wall-chat/assistant/assistant.service.spec.ts` | ✅ |
| CORE-CHAT-02 | Contexte : troncature de l'historique, construction du prompt | Unitaire | `src/modules/wall-chat/assistant/context.spec.ts` | ✅ |
| CORE-CHAT-03 | `LlmService` : fournisseur fake deterministe, openai | Unitaire | `src/modules/wall-chat/assistant/llm.service.spec.ts` | ✅ |
| CORE-CHAT-04 | `LlmService` : erreurs, retries, delai | Unitaire | `src/modules/wall-chat/assistant/llm.service.retry.spec.ts` | ✅ |
| CORE-CHAT-05 | Fournisseur OpenAI (SDK simule, sans reseau) | Unitaire | `src/modules/wall-chat/assistant/openai.provider.spec.ts` | ✅ |
| CORE-CHAT-06 | Consommateur du chat du Mur (file `canvas_events`) | Unitaire | `src/modules/wall-chat/canvas-chat.consumer.spec.ts` | ✅ |
| CORE-CHAT-07 | Flux consommateur + assistant + depot (LLM fake) | Unitaire | `src/modules/wall-chat/canvas-chat.consumer.flow.spec.ts` | ✅ |
| CORE-CHAT-08 | Depot TypeORM du chat du Mur | Unitaire | `src/modules/wall-chat/typeorm-wall-chat.repository.spec.ts` | ✅ |

### Socle commun, contrats, autres modules (`CORE-COMMON`)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-COMMON-01 | Pagination : curseur, limite, page | Unitaire | `src/common/http/pagination.spec.ts` | ✅ |
| CORE-COMMON-02 | Depots : detection MIME, liste blanche, garde-fous | Unitaire | `src/common/http/upload.spec.ts` | ✅ |
| CORE-COMMON-03 | Mappers entite → contrat (`null` jamais renvoye, projet, besoins, conversation, message) | Unitaire | `src/common/mappers/index.spec.ts` | ✅ |
| CORE-COMMON-04 | Stockage : URL signee stable, purge par prefixe | Unitaire | `src/common/storage/storage.service.spec.ts` | ✅ |
| CORE-COMMON-05 | Contrats zod de la personnalisation et du projet | Unitaire | `src/contracts/customization.spec.ts` | ✅ |
| CORE-COMMON-06 | Extrait de message (administration) | Unitaire | `src/modules/admin/message-excerpt.spec.ts` | ✅ |
| CORE-COMMON-07 | Cle de conversation directe (R-MSG1), curseur de messages | Unitaire | `src/modules/conversations/direct-key.spec.ts`, `message-cursor.spec.ts` | ✅ |
| CORE-COMMON-08 | Personnalisation : droits, miniatures, stockage | Unitaire | `src/modules/customization/customization.service.spec.ts`, `thumbnail.spec.ts` | ✅ |
| CORE-COMMON-09 | Preferences de notification par defaut (R-N4) | Unitaire | `src/modules/notifications/notification-defaults.spec.ts` | ✅ |
| CORE-COMMON-10 | Garde de session, themes seed, entretien periodique, erreurs : couverts indirectement par les tests d'integration ci-dessus | Integration | `test/integration/*.int-spec.ts` | 🆕 |

### Smoke (hors vitest)

| ID | Scenario | Type | Fichier | Statut |
| --- | --- | --- | --- | --- |
| CORE-SMOKE-01 | Parcours de bout en bout, ~380 verifications, rapport de couverture des routes | Smoke | `scripts/smoke.mjs` | ✅ |
| CORE-SMOKE-02 | Chaine du Mur (core → Hocuspocus → export → taches) et jobs IA | Smoke | `scripts/smoke-integration.mjs` | ✅ |

## 5. Bugs reveles

| Test | Bug | Gravite |
| --- | --- | --- |
| CORE-GUARD-08 | `ParseUUIDPipe` leve « Validation failed (uuid is expected) » en **anglais**, que `ApiExceptionFilter` laisse passer : viole la regle « messages en francais ». | Faible |
| CORE-PROJ-16 | `POST /projects/:slug/transfer` avec un `newOwnerId` inexistant : violation de cle etrangere non geree → **500** `internal_error` (transaction annulee, aucune donnee corrompue). Attendu : 404 « personne introuvable ». | Moyenne |

Observation hors bug (a trancher) : `POST /projects/:slug/wall/suggest-tasks`
appelle le SDK `openai` directement (`AiTasksService`) et ignore
`LLM_PROVIDER=fake` : sans `OPENAI_TOKEN`, il repond 503 au lieu d'une reponse
deterministe (CORE-WALL-06 documente le comportement actuel).

## 6. Couverture avant / apres

Pourcentage de **lignes**, par dossier. « Avant » : unitaires seuls (167
tests). « Apres » : unitaires + integration. Le cumul est calcule fichier par
fichier en prenant le meilleur des deux runs : c'est une borne basse de
l'union reelle.

| Module | Avant | Apres | Cible 60 % |
| --- | --- | --- | --- |
| `modules/auth` | 0 % | 92 % | ✅ |
| `common/auth` (garde, sessions) | 2 % | 90 % | ✅ |
| `modules/memberships` | 0 % | 94 % | ✅ |
| `modules/projects` | 17 % | 82 % | ✅ |
| `modules/tasks` | 0 % | 96 % | ✅ |
| `modules/wall` | 1 % | 95 % | ✅ |
| `modules/comments` | 0 % | 92 % | — |
| `modules/highfives` | 0 % | 90 % | — |
| `common/errors` | 9 % | 78 % | — |
| `common/http` | 63 % | 91 % | — |
| `modules/tags` | 4 % | 68 % | — |
| `modules/maintenance` | 0 % | 62 % | — |
| `modules/notifications` | 6 % | 51 % | — |
| `modules/wall-chat` | 97 % | 97 % | — |
| `modules/customization` | 11 % | 30 % | — |
| `modules/admin` | 6 % | 28 % | — |
| `modules/conversations` | 3 % | 24 % | — |
| `modules/users` | 0 % | 24 % | — |
| `modules/announcements` | 0 % | 15 % | — |
| `modules/files` | 0 % | 11 % | — |
| `modules/search` | 0 % | 9 % | — |

Nombre de tests : 167 unitaires → 179 unitaires (+12) et 142 d'integration
(dont 2 `it.fails` documentant des bugs) ; 321 au total contre 167.

## 7. Non couvert / a faire

- `modules/search`, `modules/files`, `modules/announcements`, `modules/users`
  (profil, avatar, suggestions) : aucun parcours d'integration. Le fichier
  `smoke.mjs` les exerce mais n'est pas en CI.
- `modules/admin` : seules les gardes (401/403/200) sont testees ; moderation
  des signalements, suspension de comptes, journal d'actions a ecrire.
- `modules/conversations` (messagerie, canaux de projet, pieces jointes) :
  127 lignes seulement atteintes via le cycle de vie des projets.
- `modules/notifications` : envoi indirect teste, mais pas les routes
  (liste, lecture, preferences).
- `modules/customization` : routes de depot d'image non testees (stockage fake).
- `common/storage` : vrai MinIO non utilise en integration (fake) ; couvert
  par `smoke.mjs`.
- Limitation de debit (`UserThrottlerGuard`) : relevee dans les tests, son
  comportement (429, compte par personne) n'est pas teste.
- Redis est partage entre fichiers de test : les jobs BullMQ emis ne sont pas
  verifies (le smoke d'integration le fait avec le service IA).
- Couverture cumulee unitaire + integration approximee (borne basse) ; un
  rapport fusionne necessiterait `--merge-reports` de vitest.
