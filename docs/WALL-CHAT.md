# Chat du Mur et assistant

Flux : le canvas publie `canvas_chat_message` sur la file BullMQ `canvas_events`
-> `CanvasChatConsumer` (core) sauvegarde le message (table provisoire
`wall_chat_messages`, derriere `WallChatRepository`, idempotent sur l'id du
message) -> si l'assistant est sollicite, il construit le contexte, appelle le
`LlmProvider` (`LLM_PROVIDER` = `fake` | `openai`, cle `OPENAI_API_KEY`, modele `OPENAI_MODEL`), sauvegarde la reponse (role `assistant`, auteur
`ASSISTANT_USER_ID`) et la renvoie au canvas par
`POST {CANVAS_URL}/canvas/:canvasId/chat` (en-tete `X-Internal-Secret`).

- Declenchement : `ASSISTANT_TRIGGER=mention` (defaut, message contenant `@ia`)
  ou `all`.
- Contexte : prompt systeme (titre/description du projet) + les derniers
  messages (`LLM_CONTEXT_MAX_MESSAGES`), tronques au budget
  `LLM_CONTEXT_TOKEN_BUDGET` (estimation ~4 caracteres/token) : les plus
  recents sont gardes entiers, aucun message n'est coupe, le dernier est
  toujours garde.
- Erreurs : delai `LLM_TIMEOUT_MS`, `LLM_MAX_RETRIES` tentatives en plus
  (backoff exponentiel) ; apres echec, un message d'erreur en francais est
  poste comme reponse. Le worker ne plante jamais pour une erreur LLM/canvas.
- Migration : `migrations/001_wall_chat_messages.sql` (en dev, `synchronize`).
- Rebrancher sur la messagerie : fournir une autre implementation de
  `WallChatRepository` dans `WallChatModule`.
