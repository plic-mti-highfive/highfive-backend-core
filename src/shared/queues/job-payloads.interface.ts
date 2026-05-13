import type { InteractionType } from './queue.constants.js';

/**
 * Job payload interfaces matching the redis-contract.md schema
 */

export interface UpdateUserIdentityJobData {
  tenant_id: string;
  user_id: string;
  payload: {
    bio?: string;
    skills?: string[];
  };
}

export interface UpdateProjectIdentityJobData {
  tenant_id: string;
  project_id: string;
  payload: {
    name: string;
    description?: string;
    tags?: string[];
    visibility?: string;
  };
}

export interface UserInteractedWithProjectJobData {
  tenant_id: string;
  user_id: string;
  project_id: string;
  interaction_type: InteractionType;
}

export interface ProjectStatsUpdatedJobData {
  tenant_id: string;
  project_id: string;
  likes: number;
}
