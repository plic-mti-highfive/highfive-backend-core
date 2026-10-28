import {
  Controller,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../../common/auth/decorators.js';
import {
  requireFile,
  type UploadedFile as Upload,
} from '../../common/http/upload.js';
import {
  projectCustomizationSchema,
  type CustomizationImageUpload,
  type Project,
  type ProjectCustomization,
} from '../../contracts/index.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import type { UserEntity } from '../../entities/index.js';
import { CustomizationService } from './customization.service.js';

/**
 * Plafond de lecture du corps multipart : le double de
 * `customization.maxImageBytes` (un decorateur ne lit pas la configuration).
 * Un fichier un peu trop lourd recoit ainsi le 400 du service, qui dit la
 * limite (« Ce fichier depasse 2 Mo ») ; Multer coupe la lecture exactement a
 * sa limite, une marge d'un octet ne suffisait pas. Au-dela, le 413 generique.
 */
const MAX_READ_BYTES = 2 * 2 * 1024 * 1024;

@Controller()
export class CustomizationController {
  constructor(private readonly customization: CustomizationService) {}

  /** Remplacement complet ; renvoie la fiche a jour (cache du front). */
  @Patch('projects/:slug/customization')
  save(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(projectCustomizationSchema) input: ProjectCustomization,
  ): Promise<Project> {
    return this.customization.save(slug, user, input);
  }

  /** Porteur seul ; le `PATCH` suivant reference l'`id` renvoye. */
  @Post('projects/:slug/customization/images')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_READ_BYTES } }),
  )
  uploadImage(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file: Upload | undefined,
  ): Promise<CustomizationImageUpload> {
    return this.customization.upload(slug, user, requireFile(file));
  }
}
