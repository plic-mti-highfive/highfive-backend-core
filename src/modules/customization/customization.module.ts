import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity, ProjectImageEntity } from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CustomizationController } from './customization.controller.js';
import { CustomizationService } from './customization.service.js';

/**
 * Personnalisation des fiches (docs/PERSONNALISATION.md). Depend des projets
 * pour les droits et la visibilite, jamais l'inverse.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, ProjectImageEntity]),
    ProjectsModule,
  ],
  controllers: [CustomizationController],
  providers: [CustomizationService],
  exports: [CustomizationService],
})
export class CustomizationModule {}
