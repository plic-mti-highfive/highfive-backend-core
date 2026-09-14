import {
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import { parseInteger, parseString } from '../../common/http/query.js';
import {
  notificationPreferencesUpdateInputSchema,
  type NotificationPreference,
  type NotificationSummary,
  type Paginated,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { NotificationsService } from './notifications.service.js';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** `GET /api/notifications` — deja regroupees, acteurs et cible resolus. */
  @Get('notifications')
  list(
    @CurrentUser() user: UserEntity,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<Paginated<NotificationSummary>> {
    return this.notifications.list(
      user.id,
      parseString(cursor),
      parseInteger(limit),
    );
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(204)
  async markRead(
    @CurrentUser() user: UserEntity,
    @Param('notificationId', ParseUUIDPipe) notificationId: string,
  ): Promise<void> {
    await this.notifications.markRead(user.id, notificationId);
  }

  @Post('notifications/read-all')
  @HttpCode(204)
  async markAllRead(@CurrentUser() user: UserEntity): Promise<void> {
    await this.notifications.markAllRead(user.id);
  }

  @Get('notifications/preferences')
  listPreferences(
    @CurrentUser() user: UserEntity,
  ): Promise<NotificationPreference[]> {
    return this.notifications.listPreferences(user.id);
  }

  @Patch('notifications/preferences')
  updatePreferences(
    @CurrentUser() user: UserEntity,
    @ZodBody(notificationPreferencesUpdateInputSchema)
    input: NotificationPreference[],
  ): Promise<NotificationPreference[]> {
    return this.notifications.updatePreferences(user.id, input);
  }
}
