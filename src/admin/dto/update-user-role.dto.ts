import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { SystemRole } from '../../shared/auth/system-role.enum.js';

export class UpdateUserRoleDto {
  @ApiProperty({ enum: SystemRole })
  @IsEnum(SystemRole)
  role!: SystemRole;
}
