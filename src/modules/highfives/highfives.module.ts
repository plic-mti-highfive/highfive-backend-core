import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HighfiveEntity, UserEntity } from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { HighfivesController } from './highfives.controller.js';
import { HighfivesService } from './highfives.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([HighfiveEntity, UserEntity]),
    ProjectsModule,
  ],
  controllers: [HighfivesController],
  providers: [HighfivesService],
})
export class HighfivesModule {}
