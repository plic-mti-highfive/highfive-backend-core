import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import {
  QUEUE_NAMES,
  JOB_TYPES,
  INTERACTION_TYPES,
} from './queue.constants.js';
import type {
  UpdateUserIdentityJobData,
  UpdateProjectIdentityJobData,
  UserInteractedWithProjectJobData,
} from './job-payloads.interface.js';

@Injectable()
export class QueueBridgeService {
  private readonly logger = new Logger(QueueBridgeService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.AI_TASKS)
    private readonly aiTasksQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FAST_EVENTS)
    private readonly fastEventsQueue: Queue,
  ) {}

  /**
   * Listen to profile.updated event and enqueue update_user_identity job
   */
  @OnEvent('profile.updated')
  async handleProfileUpdated(payload: {
    userId: string;
    tenantId: string;
    changes: Record<string, unknown>;
  }) {
    try {
      const jobData: UpdateUserIdentityJobData = {
        tenant_id: payload.tenantId,
        user_id: payload.userId,
        payload: {
          bio: payload.changes.bio as string | undefined,
          skills: payload.changes.skills as string[] | undefined,
        },
      };

      await this.aiTasksQueue.add(JOB_TYPES.UPDATE_USER_IDENTITY, jobData);
      this.logger.log(
        `Enqueued ${JOB_TYPES.UPDATE_USER_IDENTITY} job for user=${payload.userId} tenant=${payload.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${JOB_TYPES.UPDATE_USER_IDENTITY} job: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Listen to project.created event and enqueue update_project_identity job
   */
  @OnEvent('project.created')
  async handleProjectCreated(payload: {
    projectId: string;
    tenantId: string;
    creatorId: string;
    name: string;
    description?: string;
    tags?: string[];
    visibility?: string;
  }) {
    try {
      const jobData: UpdateProjectIdentityJobData = {
        tenant_id: payload.tenantId,
        project_id: payload.projectId,
        payload: {
          name: payload.name,
          description: payload.description,
          tags: payload.tags,
          visibility: payload.visibility,
        },
      };

      await this.aiTasksQueue.add(JOB_TYPES.UPDATE_PROJECT_IDENTITY, jobData);
      this.logger.log(
        `Enqueued ${JOB_TYPES.UPDATE_PROJECT_IDENTITY} job for project=${payload.projectId} tenant=${payload.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${JOB_TYPES.UPDATE_PROJECT_IDENTITY} job: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Listen to project.updated event and enqueue update_project_identity job
   */
  @OnEvent('project.updated')
  async handleProjectUpdated(payload: {
    projectId: string;
    tenantId: string;
    actorId: string;
    changes: Record<string, unknown>;
  }) {
    try {
      // Only enqueue if the changes are relevant for AI processing
      if (
        !payload.changes.name &&
        !payload.changes.description &&
        !payload.changes.tags
      ) {
        this.logger.debug(
          `Skipping project update job - no relevant changes for project=${payload.projectId}`,
        );
        return;
      }

      const jobData: UpdateProjectIdentityJobData = {
        tenant_id: payload.tenantId,
        project_id: payload.projectId,
        payload: {
          name: payload.changes.name as string,
          description: payload.changes.description as string | undefined,
          tags: payload.changes.tags as string[] | undefined,
          visibility: payload.changes.visibility as string | undefined,
        },
      };

      await this.aiTasksQueue.add(JOB_TYPES.UPDATE_PROJECT_IDENTITY, jobData);
      this.logger.log(
        `Enqueued ${JOB_TYPES.UPDATE_PROJECT_IDENTITY} job for project=${payload.projectId} tenant=${payload.tenantId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${JOB_TYPES.UPDATE_PROJECT_IDENTITY} job: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Listen to project.liked event and enqueue user_interacted_with_project job
   */
  @OnEvent('project.liked')
  async handleProjectLiked(payload: {
    projectId: string;
    tenantId: string;
    userId: string;
  }) {
    try {
      const jobData: UserInteractedWithProjectJobData = {
        tenant_id: payload.tenantId,
        user_id: payload.userId,
        project_id: payload.projectId,
        interaction_type: INTERACTION_TYPES.LIKE,
      };

      await this.fastEventsQueue.add(
        JOB_TYPES.USER_INTERACTED_WITH_PROJECT,
        jobData,
      );
      this.logger.log(
        `Enqueued ${JOB_TYPES.USER_INTERACTED_WITH_PROJECT} (LIKE) job for user=${payload.userId} project=${payload.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${JOB_TYPES.USER_INTERACTED_WITH_PROJECT} job: ${error}`,
      );
      throw error;
    }
  }

  /**
   * Listen to project.application.submitted event and enqueue user_interacted_with_project job
   */
  @OnEvent('project.application.submitted')
  async handleProjectApplicationSubmitted(payload: {
    projectId: string;
    tenantId: string;
    userId: string;
  }) {
    try {
      const jobData: UserInteractedWithProjectJobData = {
        tenant_id: payload.tenantId,
        user_id: payload.userId,
        project_id: payload.projectId,
        interaction_type: INTERACTION_TYPES.APPLY,
      };

      await this.fastEventsQueue.add(
        JOB_TYPES.USER_INTERACTED_WITH_PROJECT,
        jobData,
      );
      this.logger.log(
        `Enqueued ${JOB_TYPES.USER_INTERACTED_WITH_PROJECT} (APPLY) job for user=${payload.userId} project=${payload.projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to enqueue ${JOB_TYPES.USER_INTERACTED_WITH_PROJECT} job: ${error}`,
      );
      throw error;
    }
  }
}
