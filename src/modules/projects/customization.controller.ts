import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { AdminOnly, CurrentUser } from '../../common/auth/decorators.js';
import { ApiError } from '../../common/errors/api-error.js';
import {
  requireFile,
  type UploadedFile as Upload,
} from '../../common/http/upload.js';
import { ZodBody } from '../../common/http/zod.pipe.js';
import {
  projectCustomizationSchema,
  type AdminProjectMedia,
  type CustomizationImageUpload,
  type Project,
  type ProjectCustomization,
} from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { CustomizationService } from './customization.service.js';

/** Motif facultatif d'un retrait par l'administration (journalise, R-S4). */
const removeBodySchema = z.object({
  reason: z.string().trim().max(1000).optional(),
});

@Controller()
export class CustomizationController {
  constructor(private readonly customization: CustomizationService) {}

  @Patch('projects/:slug/customization')
  update(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @ZodBody(projectCustomizationSchema) input: ProjectCustomization,
  ): Promise<Project> {
    return this.customization.update(slug, user, input);
  }

  @Post('projects/:slug/customization/images')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file?: Upload,
  ): Promise<CustomizationImageUpload> {
    return this.customization.upload(slug, user, requireFile(file));
  }

  /**
   * Le corps d'un DELETE n'est pas garanti par tous les intermediaires : il
   * est lu de facon defensive, comme pour la suppression d'un projet.
   */
  @Delete('projects/:slug/customization/images/:imageId')
  @HttpCode(204)
  async remove(
    @Param('slug') slug: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @CurrentUser() user: UserEntity,
    @Body() rawBody: unknown,
  ): Promise<void> {
    const parsed = removeBodySchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw ApiError.validation(
        'Le motif est limite a 1000 caracteres.',
        parsed.error.issues,
      );
    }
    await this.customization.remove(
      slug,
      user,
      imageId,
      parsed.data.reason || undefined,
    );
  }

  @AdminOnly()
  @Get('admin/projects/:slug/media')
  adminMedia(@Param('slug') slug: string): Promise<AdminProjectMedia> {
    return this.customization.adminMedia(slug);
  }
}
