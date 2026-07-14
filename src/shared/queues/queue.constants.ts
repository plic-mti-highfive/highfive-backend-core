/**
 * Queue names and job types for Redis/BullMQ integration with backend-ai
 */

export const QUEUE_NAMES = {
  AI_TASKS: 'ai_tasks',
  FAST_EVENTS: 'fast_events',
} as const;

export const JOB_TYPES = {
  UPDATE_USER_IDENTITY: 'update_user_identity',
  UPDATE_PROJECT_IDENTITY: 'update_project_identity',
  USER_INTERACTED_WITH_PROJECT: 'user_interacted_with_project',
  PROJECT_STATS_UPDATED: 'project_stats_updated',
} as const;

export const INTERACTION_TYPES = {
  LIKE: 'LIKE',
  APPLY: 'APPLY',
} as const;

export type InteractionType =
  (typeof INTERACTION_TYPES)[keyof typeof INTERACTION_TYPES];
