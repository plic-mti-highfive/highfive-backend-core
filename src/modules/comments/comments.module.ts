import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CommentEntity,
  MembershipEntity,
  UserEntity,
} from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CommentsController } from './comments.controller.js';
import { CommentsService } from './comments.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CommentEntity, UserEntity, MembershipEntity]),
    ProjectsModule,
  ],
  controllers: [CommentsController],
  providers: [CommentsService],
  exports: [CommentsService],
})
export class CommentsModule {}
