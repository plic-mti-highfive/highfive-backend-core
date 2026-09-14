# Refonte v2 du backend — ce qui change et pourquoi

Le backend est desormais ecrit **a partir du front**, et non l'inverse. La
source de verite est le contrat publie par le depot `highfive-frontend` :

| Source | Ce qu'elle fixe |
| --- | --- |
| `docs/v2/backend/SPEC.md` | Regles metier, modele de persistance propose, ecarts connus. |
| `docs/v2/backend/openapi.yaml` | Les routes, leurs corps et leurs reponses. Copie a la racine de ce depot et servie sur `/api/docs`. |
| `docs/v2/API-ROUTES.md` | Table de synthese des routes, roles et regles. |
| `src/domain/**` | Les schemas zod. Copies dans `src/contracts/`. |
| `src/mocks/handlers/**` | Les regles deja codees cote mock, reproduites ici. |

Regle de travail : **on ne modifie jamais un schema ici sans l'avoir modifie
d'abord cote front.** C'est ce qui garantit que `openapi.yaml` — genere depuis
ces memes schemas — ne puisse pas deriver du code qui valide reellement les
requetes.

---

## 1. Ce qui a ete supprime

Tout l'ancien `src/` a ete retire. Ce qui suit n'existait dans aucun ecran du
front v2, et cout de maintenance mis a part, nourrissait surtout la confusion :

| Supprime | Pourquoi |
| --- | --- |
| **Multi-tenance** (`tenants`, `X-Tenant-ID`, `TenantGuard`, `TenantMiddleware`, colonne `tenant_id` partout) | Le front v2 ne connait pas la notion d'ecole ou d'instance. Chaque requete la portait pourtant, et chaque table la stockait. |
| **Decoupage en « bounded contexts »** (`identity/`, `project-execution/`, `showcase/`, `discovery/`) | Ces frontieres ne correspondaient a aucun ecran. Un module par domaine du contrat front est plus court a lire et plus simple a rattacher a une route. |
| **`showcase`, `discovery`** (modules stubs, evenements jamais consommes) | Des coquilles vides qui laissaient croire a des fonctions inexistantes. |
| **`skills`, `user-connections`** | Competences et reseau de contacts : aucun ecran v2. Les « interets » du contrat (10 themes maximum) les remplacent. |
| **`tickets`** (avec `checklist_items`, `ticket_comments`, statuts `TODO/IN_PROGRESS/IN_REVIEW/DONE`) | Remplaces par **Les Taches** du contrat : colonnes libres (1 a 6) et taches ordonnees, sans statut fixe ni sous-checklist. |
| **`project-messages`** | La messagerie du contrat est un domaine a part (conversations directes, groupes, canaux) : elle sera ecrite entiere, pas adaptee. |
| **`project-followers`** | Remplace par les highfives, qui portent deja le « je suis ca de loin ». |
| **JWT access/refresh + passport** | Remplaces par un jeton opaque et une table `sessions` : `POST /auth/logout` doit reellement invalider le jeton, ce qu'un JWT autoportant ne permet pas sans liste de revocation — laquelle revient a cette table. |
| **`class-validator` / `class-transformer` et les DTO decores** | La validation passe par les schemas zod du contrat (SPEC.md §1.7). Deux jeux de regles auraient fini par diverger. |
| **Swagger genere depuis les decorateurs** | Le contrat `openapi.yaml` du front est servi tel quel. Une documentation reconstruite depuis le code aurait ete une seconde verite. |
| **`@plic-mti-highfive/shared-types`** | Voir §5. |

## 2. Ce qui est implemente

**76 des 84 operations du contrat.** Les 8 manquantes sont celles de la
messagerie (§3). S'y ajoutent 6 routes hors contrat, toutes documentees : deux
sondes de sante, trois routes du Mur (`docs/CANVAS.md` §2) et `POST /reports`
(§6). Un module par domaine, sous `src/modules/` :

| Domaine | Routes | Module |
| --- | --- | --- |
| Auth | 6 | `auth/` |
| Themes | 1 | `tags/` |
| Personnes | 4 + avatar | `users/` |
| Projets | 8 | `projects/` |
| Highfives | 3 | `highfives/` |
| Equipe, demandes, invitations | 13 | `memberships/` |
| Annonces | 4 | `announcements/` |
| Commentaires | 4 | `comments/` |
| Taches et colonnes | 8 | `tasks/` |
| Le Mur | 2 (+3 hors contrat, voir `CANVAS.md`) | `wall/` |
| Fichiers | 3 | `files/` |
| Notifications | 5 | `notifications/` |
| Recherche et fil | 4 | `search/` |
| Administration | 10 (+1, voir §6) | `admin/` |
| Entretien periodique (archivage, expirations, purge) | — | `maintenance/` |

Verifiable de bout en bout :

| Commande | Ce qu'elle prouve |
| --- | --- |
| `pnpm check:contract` | Aucune derive entre les controleurs et `openapi.yaml`. Ne demande rien de demarre. |
| `pnpm smoke` | ~200 verifications sur une API demarree, chacune rattachee a une regle du contrat (R-PR1, R-H1/H2, R-M1/M2/M3/M4, R-I1/I2/I3, R-D2/D3, R-A1/A2, R-C2/C3/C4, R-K1/K3/K4/K5, R-W1/W2, R-F1/F2/F3/F4, R-N2/N3/N4, R-P1, R-S2/S4, R-PR7, R-V4/V8, R-X3). Le script **echoue si une route servie n'est exercee par aucun scenario** : 82 sur 82 le sont. |
| `pnpm smoke:integration` | La chaine complete du Mur — le core emet un jeton, un vrai client Yjs se connecte au service canvas, ecrit des records tldraw, et la conversion en taches reprend leur texte reel — puis le depot effectif des jobs sur les files du service IA. |

Ce que ces scripts ne couvrent volontairement pas est liste dans
`scripts/README.md`.

## 3. Ce qui n'est pas implemente : la messagerie

`/conversations`, `/messages` et leurs huit routes sont **volontairement
absents** — c'est le lot suivant. Concretement :

- `src/contracts/conversation.ts` n'a pas ete copie depuis le front ;
- aucune table `conversations` / `messages` n'existe ;
- le type de notification `message_received` existe dans le contrat mais n'est
  jamais emis, et `NotificationTarget` de type `message` n'est jamais resolu
  (une telle notification serait ecartee de la liste plutot que renvoyee sans
  lien exploitable) ;
- l'apercu d'un signalement visant un message renvoie « rien », jamais une
  invention.

Le **chat du Mur**, lui, existe deja cote service canvas et n'a pas ete
touche : voir `CANVAS.md` §2.

## 4. Le service IA : ce qui est branche, et rien de plus

Le depot `highfive-backend-ai` n'a **pas ete modifie**. C'est le core qui
s'adapte a son contrat (`docs/redis-contract.md`), y compris au `tenant_id`
qu'il exige encore : on lui envoie une constante (`AI_TENANT_ID`) plutot que de
le reecrire.

Deux canaux, et deux seulement (`src/common/ai/`) :

**Ecriture — files BullMQ** (`AiEventsService`) :

| Evenement | File | Job |
| --- | --- | --- |
| Inscription, modification de profil | `ai_tasks` | `update_user_identity` |
| Creation, modification, publication d'un projet **public** | `ai_tasks` | `update_project_identity` |
| Highfive donne | `fast_events` | `user_interacted_with_project` (`LIKE`) |
| Demande a rejoindre | `fast_events` | `user_interacted_with_project` (`APPLY`) |
| Compteur de highfives modifie | `fast_events` | `project_stats_updated` |

Un projet prive n'est jamais envoye (R-IA-23). Aucun echec de file ne fait
echouer la requete qui l'a declenche : un projet doit pouvoir se creer avec
Redis eteint.

**Lecture — HTTP** (`AiRecommendationsService`, une seule tentative, 12 s max,
R-IA-28) :

| Usage | Appel |
| --- | --- |
| Ordre de la section « Pour toi » de Decouvrir | `GET /api/v1/matchmaking/users/{id}/projects` |
| Colonne « Des gens a rencontrer » | `GET /api/v1/matchmaking/projects/{id}/users` |

Dans les deux cas, l'IA **ordonne**, elle ne selectionne pas : le bassin de
projets reste celui des regles deterministes (themes suivis, projets
decouvrables). Si elle ne repond pas, l'ordre retombe sur l'activite recente et
la section reste affichee. `AI_URL` vide desactive proprement ces appels.

La generation de taches a partir du Mur appelle OpenAI **directement depuis le
core**, sans passer par le service IA : c'est ce que faisait le code existant,
et le deplacer aurait demande de modifier le service IA.

## 5. Suppression de `shared-types`

Le paquet publie `@plic-mti-highfive/shared-types` n'est plus utilise nulle
part. Il portait trois choses, traitees separement :

| Contenu | Devenu |
| --- | --- |
| Enums metier (`ProjectStatus`, `TicketStatus`, `ProjectRole`, `UserStatus`...) | Remplaces par les enums du contrat front (`src/contracts/`), qui ne sont pas les memes (`draft/active/done/archived`, `owner/co_owner/member/observer`...). |
| Types du canvas (`CanvasTokenPayload`, `CanvasExport`, `CANVAS_KEYS`...) | Declares a l'identique dans `core_backend/src/modules/wall/canvas.types.ts` et `highfive-backend-canvas/src/contract/index.ts`. Toute modification doit etre faite dans les deux depots. |
| `UserContext`, `StorageFolder`, `SearchEntityType` | Sans usage, ou remplaces par le contrat. |

Consequences pratiques : plus de `.npmrc`, plus de `registry-url` dans les
pipelines, plus de secret `github_token` dans les constructions d'images.

Le depot `highfive-shared-types` peut etre archive : plus rien ne le consomme.

## 6. Ecarts assumes vis-a-vis de `SPEC.md`

Numerotation de la section 6 de `SPEC.md` (« Ecarts connus »).

| # | Point | Decision ici |
| --- | --- | --- |
| 1 | `viewerHasHighfived` absent de `Project` | Non ajoute : le contrat front ne le porte pas. L'etat initial du bouton reste indeterminable sans appel supplementaire — a trancher cote produit. |
| 2 | Etat de sa propre demande a rejoindre | Non ajoute. Une seconde demande renvoie `409` avec un message explicite, ce qui couvre le cas pratique. |
| 3 | « Depuis ta derniere visite » | Non construit : aucun ecran ne le demande. |
| 4 | `DELETE /me`, suppression de compte par l'administration | Non ajoutes. L'anonymisation (R-P2) est en revanche implementee et declenchee par l'entretien periodique. |
| 5 | Activation/desactivation d'un theme | Pas de route. La colonne `active` existe et est respectee a la lecture ; seule une migration peut la changer. |
| 6 | `POST /reports` | **Ajoute** — sans creation de signalement, la file de moderation est vide par construction. C'est le seul ajout de route hors contrat, hors Mur. |
| 7 | Limite de membres par projet (R-M5) | Non implementee : le champ n'existe pas dans `ProjectUpdateInput`. |
| 8 | Reglage « Mur/Taches ouverts aux observateurs » | Non implemente ; le defaut du document produit est applique (lecture pour les observateurs). |
| 9 | Accord explicite au transfert de propriete (R-M2) | Transfert immediat, comme le mock. Le destinataire n'est pas consulte. |
| 10 | Archivage a 180 jours (R-PR6), expiration des invitations (R-I1), purge a 30 jours (R-X3) | **Implementes**, dans `modules/maintenance/`. Un simple intervalle, pas un ordonnanceur : ces travaux sont idempotents. Le jour ou plusieurs instances tourneront en parallele, il faudra un verrou. |
| 11 | `DELETE /admin/projects/{slug}` | Conservee, sans confirmation nominative, pour un usage programmatique. |

Ecarts supplementaires, decides ici :

- **Pagination par decalage encode** (`base64url`), pas par keyset. SPEC.md §1.4
  recommande le keyset pour un vrai volume ; c'est le seul fichier a changer
  (`src/common/http/pagination.ts`) le jour ou une liste depasse quelques
  milliers de lignes.
- **Tri `relevant`** : trie par date de creation, faute de recherche plein
  texte. On prefere ne pas feindre un score de pertinence qu'on ne calcule pas.
- **Personne bloquee** : elle perd tout role sur le projet, y compris l'acces en
  lecture a un projet prive. Le mock, lui, la laissait voir.
- **Courriels** : aucun envoi. Le jeton de reinitialisation de mot de passe est
  cree, stocke hache, et journalise en developpement.
- **Apercu du Mur** (`snapshotUrl`) : jamais genere. Voir `CANVAS.md` §3.
