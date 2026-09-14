# Base de donnees — core_backend

Modele relationnel PostgreSQL, derive de `SPEC.md` §2 du contrat front.
Les entites TypeORM vivent dans `src/entities/` ; en developpement, le schema
est synchronise automatiquement (`synchronize: true`), en production il doit
etre gere par migration.

Les colonnes `created_at` / `updated_at` triviales ne sont pas repetees. Les
contraintes listees sont celles qui **portent une regle metier** (R-xx du
document de domaine).

## Identite

| Table | Colonnes cles | Contraintes / notes |
| --- | --- | --- |
| `users` | `id` uuid PK, `username` unique, `display_name`, `email` unique, `avatar_url`, `bio`, `account_status`, `platform_role`, `password_hash`, `last_visit_at`, `deleted_at` | R-P2 : `deleted_at` declenche l'anonymisation (pseudo remplace par `compte-supprime-<id>` pour garder l'unicite, courriel et mot de passe vides). Mot de passe hache en argon2. |
| `user_interests` | `user_id`, `tag_id`, PK composite | 0 a 10 lignes par personne. Table de jointure plutot qu'un tableau : integrite referentielle vers `tags`. |
| `sessions` | `token_hash` PK, `user_id`, `expires_at` | Jeton opaque, jamais stocke en clair. `POST /auth/logout` supprime la ligne. |
| `password_reset_tokens` | `token_hash` PK, `user_id`, `expires_at`, `used_at` | Usage unique, une heure de validite. |
| `tags` | `id` slug PK, `label`, `family`, `accent`, `active` | R-T1 : desactivation, jamais de `DELETE`. Liste fermee de 24 lignes, semee au demarrage depuis `src/contracts/tag.ts`. |

## Projets

| Table | Colonnes cles | Contraintes / notes |
| --- | --- | --- |
| `projects` | `id` uuid PK, `slug` unique, `owner_id`, `title`, `tagline`, `description`, `visibility`, `participation`, `state`, `highfive_count`, `last_activity_at`, `deleted_at` | R-PR1 verifiee sur l'etat resultant d'un `PATCH`, pas seulement sur le corps recu. `highfive_count` est un cache, jamais accepte en entree (R-X2). Index `(visibility, state, last_activity_at)` pour le fil. |
| `project_tags` | `project_id`, `tag_id`, PK composite | 1 a 5 lignes par projet. |
| `needs` | `id` uuid PK, `project_id`, `label`, `tag_id`, `fulfilled`, `fulfilled_at` | 6 au maximum. Un besoin pourvu reste renvoye 7 jours, filtre a la lecture — pas de purge planifiee. |
| `memberships` | `project_id`, `user_id`, PK composite, `role`, `joined_at`, `blocked` | R-M1 : index unique partiel `WHERE role = 'owner'`. Creation et transfert sont transactionnels. |
| `join_requests` | `id` uuid PK, `project_id`, `user_id`, `message`, `status`, `decided_at` | Index unique partiel `WHERE status = 'pending'`. R-D2 (30 jours apres un refus) verifie sur `decided_at`. |
| `invitations` | `id` uuid PK, `project_id`, `sender_id`, `recipient_id`, `proposed_role`, `status`, `expires_at` | R-I1 : expiration appliquee a la lecture **et** par l'entretien periodique. |
| `highfives` | `project_id`, `user_id`, PK composite, `given_at` | R-H1 : la PK composite suffit a rendre donner/retirer idempotents. |

## Contenu

| Table | Colonnes cles | Contraintes / notes |
| --- | --- | --- |
| `announcements` | `id` uuid PK, `project_id`, `author_id`, `title`, `body`, `pinned`, `published_at` | R-A2 : index unique partiel `WHERE pinned = true` ; epingler depingle l'ancienne dans la meme transaction. |
| `comments` | `id` uuid PK, `project_id`, `author_id`, `body`, `parent_id`, `hidden`, `published_at` | R-C4 : un `parent_id` pointant un commentaire deja repondu est refuse a l'ecriture. |
| `project_files` | `id` uuid PK, `project_id`, `uploaded_by`, `name`, `size` bigint, `mime_type`, `storage_key` | R-F1 : 20 Mo par fichier, 200 Mo par projet. `storage_key` renvoie au stockage objet, le contenu n'est jamais en base. |

## Le Lab

| Table | Colonnes cles | Contraintes / notes |
| --- | --- | --- |
| `columns` | `id` uuid PK, `project_id`, `label`, `position`, `color` | R-K1 : trois colonnes creees avec le projet. R-K2 : 1 a 6. `position` plutot que `order`, mot reserve SQL. |
| `tasks` | `id` uuid PK, `column_id`, `title`, `details`, `due_date`, `position`, `created_by`, `wall_origin_id` | `wall_origin_id` n'est pas une cle etrangere : Le Mur est un document CRDT, pas une table. |
| `task_assignees` | `task_id`, `user_id`, PK composite | R-K5 : plusieurs assignes possibles. |
| `walls` | `project_id` PK, `canvas_id`, `snapshot_url`, `updated_at` | Une ligne par projet, creee avec lui. Le document vit dans le service canvas — voir `docs/CANVAS.md`. |

## Notifications, moderation

| Table | Colonnes cles | Contraintes / notes |
| --- | --- | --- |
| `notifications` | `id` uuid PK, `recipient_id`, `type`, `target_type`, `target_id`, `read` | Index `(recipient_id, created_at)`. |
| `notification_actors` | `notification_id`, `user_id`, PK composite | R-N2 : c'est cette table qui realise le regroupement (« Sophie et 4 autres... ») — un evenement sur une cible deja notifiee et non lue ajoute une ligne, au lieu de creer une notification. |
| `notification_preferences` | `user_id`, `type`, PK composite, `channels` | R-N4 : l'absence de ligne vaut « defauts », calcules a la lecture. Rien n'est materialise pour qui n'a rien regle. |
| `reports` | `id` uuid PK, `reporter_id`, `target_type`, `target_id`, `reason`, `detail`, `status`, `handled_by` | `target_id` est polymorphe : pas de cle etrangere typee, existence verifiee a la creation. |
| `admin_actions` | `id` uuid PK, `admin_id`, `type`, `target_type`, `target_id`, `reason` | R-S4 : table en ajout seul. Aucune route ne la modifie ni ne la supprime. |

## Absentes

`conversations`, `conversation_participants`, `messages` : la messagerie n'est
pas implementee (voir `docs/REFACTO-V2.md` §3).
