import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';

import { User } from '../identity/users/entities/user.entity.js';
import { UserConnection } from '../identity/user-connections/entities/user-connection.entity.js';
import { Tenant } from '../identity/tenants/entities/tenant.entity.js';
import { RefreshToken } from '../identity/auth/entities/refresh-token.entity.js';
import { Project } from '../project-execution/projects/entities/project.entity.js';
import { ProjectMember } from '../project-execution/project-members/entities/project-member.entity.js';
import { ProjectHighfive } from '../project-execution/project-highfives/entities/project-highfive.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserConnection,
      Tenant,
      RefreshToken,
      Project,
      ProjectMember,
      ProjectHighfive,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
