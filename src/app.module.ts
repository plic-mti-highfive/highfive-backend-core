import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';

import configuration from './shared/config/configuration.js';
import { DatabaseModule } from './shared/database/database.module.js';
import { TenantMiddleware } from './shared/tenant/tenant.middleware.js';
import { TenantGuard } from './shared/tenant/tenant.guard.js';
import { JwtAuthGuard } from './shared/auth/jwt-auth.guard.js';
import { SystemRolesGuard } from './shared/auth/system-roles.guard.js';

import { TenantsModule } from './identity/tenants/tenants.module.js';
import { UsersModule } from './identity/users/users.module.js';
import { AuthModule } from './identity/auth/auth.module.js';
import { UserProfilesModule } from './identity/user-profiles/user-profiles.module.js';
import { SkillsModule } from './identity/skills/skills.module.js';
import { UserConnectionsModule } from './identity/user-connections/user-connections.module.js';

import { ProjectsModule } from './project-execution/projects/projects.module.js';
import { ProjectMembersModule } from './project-execution/project-members/project-members.module.js';
import { TicketsModule } from './project-execution/tickets/tickets.module.js';
import { ProjectMessagesModule } from './project-execution/project-messages/project-messages.module.js';
import { TagsModule } from './project-execution/tags/tags.module.js';
import { ProjectHighfivesModule } from './project-execution/project-highfives/project-highfives.module.js';

import { DiscoveryModule } from './discovery/discovery.module.js';
import { SearchModule } from './discovery/search/search.module.js';
import { ShowcaseModule } from './showcase/showcase.module.js';
import { DomainEventsModule } from './shared/events/domain-events.module.js';
import { AdminModule } from './admin/admin.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
    EventEmitterModule.forRoot(),
    DatabaseModule,

    // Identity & Tenancy
    TenantsModule,
    UsersModule,
    AuthModule,
    UserProfilesModule,
    SkillsModule,
    UserConnectionsModule,

    // Project Execution
    ProjectsModule,
    ProjectMembersModule,
    TicketsModule,
    ProjectMessagesModule,
    TagsModule,
    ProjectHighfivesModule,

    // Stubs
    DiscoveryModule,
    SearchModule,
    ShowcaseModule,

    // Admin (dashboard plateforme)
    AdminModule,

    // Cross-cutting
    DomainEventsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SystemRolesGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
