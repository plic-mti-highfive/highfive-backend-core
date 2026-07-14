import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserStatus } from '@plic-mti-highfive/shared-types';
import type { User } from '../entities/user.entity.js';

class ProfileBaseDto {
  @ApiPropertyOptional() bio!: string | null;
  @ApiPropertyOptional() avatarPath!: string | null;
  @ApiPropertyOptional() themePreference!: string;
  @ApiPropertyOptional() emailNotifications!: boolean;
}

export class UserResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ enum: UserStatus })
  status!: UserStatus;

  @ApiProperty()
  tenantId!: string;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;

  @ApiPropertyOptional({ type: () => ProfileBaseDto })
  profile?: ProfileBaseDto;

  static fromUser(user: User): UserResponseDto {
    const dto = new UserResponseDto();
    dto.id = user.id;
    dto.email = user.email;
    dto.status = user.status;
    dto.tenantId = user.tenantId;
    dto.createdAt = user.createdAt;
    dto.updatedAt = user.updatedAt;

    if (user.profile) {
      dto.profile = {
        bio: user.profile.bio,
        avatarPath: user.profile.avatarPath,
        themePreference: user.profile.themePreference,
        emailNotifications: user.profile.emailNotifications,
      };
    }

    return dto;
  }
}
