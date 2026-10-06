# Chat du Mur et assistant

Flux : le canvas publie `canvas_chat_message` sur la file BullMQ `canvas_events`
-> `CanvasChatConsumer` (core) sauvegarde le message (`MessageEntity` dans la
conversation `wall` du projet, derriere `WallChatRepository`, idempotent sur l'id
du message) -> si l'assistant est sollicite, il construit le contexte, appelle le
`LlmProvider` (`LLM_PROVIDER` = `fake` | `openai`, cle `OPENAI_API_KEY`, modele `OPENAI_MODEL`), sauvegarde la reponse (`MessageEntity`, auteur
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
- Stockage : `conversations.kind` (`messaging` par defaut | `wall`, varchar(16)).
  Une conversation `wall` par projet (index unique partiel
  `uq_conversations_wall_project` sur `project_id WHERE kind = 'wall'`), de
  `type = 'channel'` (le CHECK du projet exige un `project_id` pour ce type) ;
  l'index du canal d'equipe est donc restreint a `kind = 'messaging'`. Ses
  participants sont l'equipe, synchronises par `ChannelsService.sync` en meme
  temps que le canal ; elle est creee a la volee a la 1re ecriture
  (`wallConversationId`) et supprimee avec le projet. Les routes
  `/conversations...` filtrent `kind = 'messaging'` : le chat du Mur n'y apparait
  pas (404 sur son id). Le contrat n'est pas modifie.
- Messages : l'id genere par le canvas est l'id du `MessageEntity` ;
  `INSERT ... ON CONFLICT DO NOTHING` donne l'idempotence. Le role n'est pas
  stocke : une reponse de l'assistant est un message dont l'auteur est
  `ASSISTANT_USER_ID`.
- Assistant : `messages.author_id` est `uuid NOT NULL` sans cle etrangere ; on
  utilise l'identifiant reserve `00000000-0000-4000-8000-0000000000a1`, sans
  ligne `users` (un faux compte apparaitrait dans recherches et recommandations).
- Forme du message (Y.Doc, `canvas_events`, `POST /canvas/:id/chat`, export) :
  `{ id, conversationId?, authorId, body, sentAt (ISO), editedAt?, deleted,
  isAssistant? }`, comme le `Message` du contrat. Types dupliques :
  `src/modules/wall/canvas.types.ts` (core) / `src/contract/` (canvas).
- Schema : `synchronize` (dev) cree la colonne et les index ; hors dev rien n'est
  joue (le schema entier repose sur `synchronize`). L'ancienne table
  `wall_chat_messages` et son script de migration sont supprimes ; une base de
  dev existante peut `DROP TABLE wall_chat_messages` (ses messages ne sont pas
  repris).
