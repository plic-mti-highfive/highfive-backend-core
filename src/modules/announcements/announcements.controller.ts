import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  announcementCreateInputSchema,
  type Announcement,
  type AnnouncementCreateInput,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import {
  AnnouncementsService,
  type AnnouncementWithAuthor,
} from './announcements.service.js';

@Controller()
export class AnnouncementsController {
  constructor(private readonly announcements: AnnouncementsService) {}

  @Public()
  @Get('projects/:slug/announcements')
  list(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<AnnouncementWithAuthor[]> {
    return this.announcements.list(slug, user);
  }

  @Post('projects/:slug/announcements')
  @HttpCode(201)
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(announcementCreateInputSchema) input: AnnouncementCreateInput,
  ): Promise<Announcement> {
    return this.announcements.create(slug, user, input);
  }

  @Post('announcements/:announcementId/pin')
  @HttpCode(200)
  pin(
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<Announcement> {
    return this.announcements.pin(user, announcementId);
  }

  @Delete('announcements/:announcementId')
  @HttpCode(204)
  remove(
    @Param('announcementId', ParseUUIDPipe) announcementId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.announcements.remove(user, announcementId);
  }
}
