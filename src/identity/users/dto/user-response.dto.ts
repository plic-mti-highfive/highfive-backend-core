import { ApiProperty } from '@nestjs/swagger';
import { UserStatus } from '@plic-mti-highfive/shared-types';
import { SystemRole } from '../../../shared/auth/system-role.enum.js';
import type { User } from '../entities/user.entity.js';

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty({ enum: SystemRole })
  systemRole!: SystemRole;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  static fromUser(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.status = user.status;
    dto.systemRole = user.systemRole;
    dto.tenantId = user.tenantId;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;
    return dto;
  }
}
