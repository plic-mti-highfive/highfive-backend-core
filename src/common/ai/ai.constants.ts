/**
 * Contrat Redis du service IA (`highfive-backend-ai/docs/redis-contract.md`).
 * Ces noms sont imposes par lui : ne rien renommer ici sans l'y renommer.
 */
export const AI_QUEUES = {
  /** Appels OpenAI (embeddings) : lent, concurrence 5. */
  AI_TASKS: 'ai_tasks',
  /** Operations SQL/mathematiques locales : instantane, concurrence 2. */
  FAST_EVENTS: 'fast_events',
} as const;

export const AI_JOBS = {
  UPDATE_USER_IDENTITY: 'update_user_identity',
  UPDATE_PROJECT_IDENTITY: 'update_project_identity',
  USER_INTERACTED_WITH_PROJECT: 'user_interacted_with_project',
  PROJECT_STATS_UPDATED: 'project_stats_updated',
} as const;

export const AI_INTERACTIONS = {
  /** Un highfive. */
  LIKE: 'LIKE',
  /** Une demande a rejoindre : un signal d'interet plus fort qu'un highfive. */
  APPLY: 'APPLY',
} as const;
