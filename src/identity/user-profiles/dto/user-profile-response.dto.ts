import { ApiProperty } from '@nestjs/swagger';
import { User } from '../../users/entities/user.entity';

export class MinimalProfileDto {
  @ApiProperty({ description: 'User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Username (email prefix)' })
  username!: string;

  @ApiProperty({ description: 'Display name' })
  displayName!: string;

  @ApiProperty({ description: 'Avatar URL or path' })
  avatar!: string;

  static fromUser(user: User): MinimalProfileDto {
    const username = user.email.split('@')[0];
    return {
      userId: user.id,
      username,
      displayName: user.profile?.displayName || username,
      avatar:
        user.profile?.avatarPath ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.id}`,
    };
  }
}

export class UserProfileResponseDto {
  @ApiProperty({ description: 'User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Username (email prefix)' })
  username!: string;

  @ApiProperty({ description: 'Display name' })
  displayName!: string;

  @ApiProperty({ description: 'Avatar URL or path' })
  avatar!: string;

  @ApiProperty({ description: 'User bio', nullable: true })
  bio!: string | null;

  @ApiProperty({ description: 'Account creation date', type: String })
  createdAt!: string;

  @ApiProperty({ description: 'Array of skill names' })
  skills!: string[];

  @ApiProperty({
    description: 'User statistics with follower/following counts',
  })
  stats!: {
    followers: number;
    following: number;
  };

  @ApiProperty({
    description: 'Array of follower profiles',
    type: [MinimalProfileDto],
  })
  followers!: MinimalProfileDto[];

  @ApiProperty({
    description: 'Array of following user profiles',
    type: [MinimalProfileDto],
  })
  following!: MinimalProfileDto[];
}
