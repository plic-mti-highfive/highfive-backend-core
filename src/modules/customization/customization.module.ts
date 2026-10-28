import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectEntity, ProjectImageEntity } from '../../entities/index.js';
import { AdminModule } from '../admin/admin.module.js';
import { ProjectsModule } from '../projects/projects.module.js';
import { CustomizationController } from './customization.controller.js';
import { CustomizationService } from './customization.service.js';
import { LegacyCustomizationService } from './legacy-customization.service.js';

/**
 * Personnalisation des fiches (docs/PERSONNALISATION.md). Depend des projets
 * (droits, visibilite) et de l'administration (journal), jamais l'inverse :
 * c'est pourquoi la vue admin des medias est servie ici.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([ProjectEntity, ProjectImageEntity]),
    ProjectsModule,
    AdminModule,
  ],
  controllers: [CustomizationController],
  providers: [CustomizationService, LegacyCustomizationService],
  exports: [CustomizationService],
})
export class CustomizationModule {}
