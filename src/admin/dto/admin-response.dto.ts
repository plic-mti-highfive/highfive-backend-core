import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@plic-mti-highfive/shared-types';

/** Statut projet tel qu'attendu par le dashboard admin (frontend). */
export type AdminProjectStatus = 'active' | 'archived';

export class AdminStatsDto {
  @ApiProperty() totalUsers!: number;
  @ApiProperty() activeUsers!: number;
  @ApiProperty() pendingUsers!: number;
  @ApiProperty() suspendedUsers!: number;
  @ApiProperty() totalProjects!: number;
  @ApiProperty() activeProjects!: number;
  @ApiProperty() totalTenants!: number;
  @ApiProperty() newUsersThisWeek!: number;
  @ApiProperty() newProjectsThisWeek!: number;
  @ApiProperty() onlineUsers!: number;
}

export class AdminUserDto {
  @ApiProperty() id!: string;
  @ApiProperty() email!: string;
  @ApiProperty() username!: string;
  @ApiProperty({ enum: UserStatus }) status!: UserStatus;
  @ApiProperty() projectsCount!: number;
  @ApiProperty() followersCount!: number;
  @ApiProperty() joinedAt!: Date;
}

export class AdminProjectDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() description!: string;
  @ApiProperty() ownerUsername!: string;
  @ApiProperty() membersCount!: number;
  @ApiProperty() highfiveCount!: number;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ enum: ['active', 'archived'] })
  status!: AdminProjectStatus;
}

export class AdminTenantDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() domain!: string;
  @ApiProperty() usersCount!: number;
  @ApiProperty() projectsCount!: number;
  @ApiProperty() createdAt!: Date;
}

export class DailyRegistrationDto {
  @ApiProperty({ description: "Libellé court de la date, ex. '02 juin'" })
  date!: string;

  @ApiProperty() inscriptions!: number;
}

export class RecentlyClosedProjectDto {
  @ApiProperty() id!: string;
  @ApiProperty() name!: string;
  @ApiProperty() ownerUsername!: string;
  @ApiProperty() closedAt!: Date;
  @ApiProperty() membersCount!: number;
  @ApiProperty() highfiveCount!: number;
}
