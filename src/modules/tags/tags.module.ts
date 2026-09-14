import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TagEntity } from '../../entities/index.js';
import { TagsController } from './tags.controller.js';
import { TagsService } from './tags.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([TagEntity])],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
