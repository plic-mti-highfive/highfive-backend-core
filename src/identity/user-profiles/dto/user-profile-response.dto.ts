import { ApiProperty } from '@nestjs/swagger';

export class MinimalProfileDto {
  @ApiProperty({ description: 'User ID (UUID)' })
  userId!: string;

  @ApiProperty({ description: 'Username (email prefix)' })
  username!: string;

  @ApiProperty({ description: 'Display name' })
  displayName!: string;

  @ApiProperty({ description: 'Avatar URL or path' })
  avatar!: string;
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
