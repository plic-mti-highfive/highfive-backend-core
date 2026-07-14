import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class DiscoveryService {
  private readonly logger = new Logger(DiscoveryService.name);

  @OnEvent('profile.updated')
  handleProfileUpdated(payload: {
    userId: string;
    tenantId: string;
    changes: Record<string, any>;
  }) {
    this.logger.debug(
      `ProfileUpdated event received — user=${payload.userId} tenant=${payload.tenantId}`,
    );
  }

  @OnEvent('ticket.created')
  handleTicketCreated(payload: {
    ticketId: string;
    projectId: string;
    tenantId: string;
  }) {
    this.logger.debug(
      `TicketCreated event received — ticket=${payload.ticketId} project=${payload.projectId}`,
    );
  }

  @OnEvent('ticket.updated')
  handleTicketUpdated(payload: {
    ticketId: string;
    projectId: string;
    tenantId: string;
    changes: Record<string, any>;
  }) {
    this.logger.debug(
      `TicketUpdated event received — ticket=${payload.ticketId} project=${payload.projectId}`,
    );
  }

  @OnEvent('project.visibility.changed')
  handleProjectVisibilityChanged(payload: {
    projectId: string;
    tenantId: string;
    oldVisibility: string;
    newVisibility: string;
  }) {
    this.logger.debug(
      `ProjectVisibilityChanged event received — project=${payload.projectId} ${payload.oldVisibility} -> ${payload.newVisibility}`,
    );
  }
}
