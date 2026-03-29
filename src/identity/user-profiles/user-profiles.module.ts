import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserProfile } from './entities/user-profile.entity.js';
import { UserProfilesService } from './user-profiles.service.js';
import { UserProfilesController } from './user-profiles.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserProfile])],
  controllers: [UserProfilesController],
  providers: [UserProfilesService],
  exports: [UserProfilesService],
})
export class UserProfilesModule {}
