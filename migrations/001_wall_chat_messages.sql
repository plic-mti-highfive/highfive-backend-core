-- Chat du Mur (T2). En developpement la table est creee par `synchronize` ;
-- ce script sert aux environnements ou celui-ci est coupe. A remplacer par la
-- messagerie (conversations/messages) quand elle sera integree.
CREATE TABLE IF NOT EXISTS wall_chat_messages (
  id          uuid PRIMARY KEY,
  project_id  uuid        NOT NULL,
  canvas_id   uuid        NOT NULL,
  author_id   uuid        NOT NULL,
  role        varchar(16) NOT NULL CHECK (role IN ('user', 'assistant')),
  body        text        NOT NULL,
  sent_at     timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wall_chat_messages_project_sent
  ON wall_chat_messages (project_id, sent_at);
