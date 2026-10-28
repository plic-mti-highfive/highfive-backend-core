import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity, ProjectImageEntity } from '../../entities/index.js';
import { ProjectsModule } from '../projects/projects.module.js';

/**
 * Personnalisation des fiches (docs/PERSONNALISATION.md). Depend des projets
 * pour les droits et la visibilite, jamais l'inverse.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, ProjectImageEntity]),
    ProjectsModule,
  ],
})
export class CustomizationModule {}
