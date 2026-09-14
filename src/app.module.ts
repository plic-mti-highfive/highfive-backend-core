import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import configuration from './common/config/configuration.js';
import { DatabaseModule } from './common/database/database.module.js';
import { AuthCoreModule } from './common/auth/auth-core.module.js';
import { AuthGuard } from './common/auth/auth.guard.js';
import { StorageModule } from './common/storage/storage.service.js';
import { AiModule } from './common/ai/ai.module.js';
import { HealthModule } from './common/health/health.controller.js';

import { AdminModule } from './modules/admin/admin.module.js';
import { AnnouncementsModule } from './modules/announcements/announcements.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { CommentsModule } from './modules/comments/comments.module.js';
import { FilesModule } from './modules/files/files.module.js';
import { HighfivesModule } from './modules/highfives/highfives.module.js';
import { MaintenanceModule } from './modules/maintenance/maintenance.module.js';
import { MembershipsModule } from './modules/memberships/memberships.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { ProjectsModule } from './modules/projects/projects.module.js';
import { SearchModule } from './modules/search/search.module.js';
import { TagsModule } from './modules/tags/tags.module.js';
import { TasksModule } from './modules/tasks/tasks.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { WallModule } from './modules/wall/wall.module.js';

/**
 * Un module par domaine du contrat front (`docs/v2/API-ROUTES.md` du depot
 * `highfive-frontend`), et rien d'autre : plus de decoupage en « bounded
 * contexts » qui ne correspondaient a aucun ecran.
 *
 * La messagerie (`/conversations`, `/messages`) n'est volontairement pas ici :
 * elle est prevue dans un second temps, voir `docs/REFACTO-V2.md`.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 200 }]),
    DatabaseModule,
    AuthCoreModule,
    StorageModule,
    AiModule,
    HealthModule,

    TagsModule,
    AuthModule,
    UsersModule,
    ProjectsModule,
    HighfivesModule,
    MembershipsModule,
    AnnouncementsModule,
    CommentsModule,
    TasksModule,
    WallModule,
    FilesModule,
    NotificationsModule,
    SearchModule,
    AdminModule,
    MaintenanceModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
