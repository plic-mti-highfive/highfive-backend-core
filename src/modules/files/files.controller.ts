import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser, Public } from '../../common/auth/decorators.js';
import {
  requireFile,
  type UploadedFile as Upload,
} from '../../common/http/upload.js';
import type { ProjectFile } from '../../contracts/index.js';
import type { UserEntity } from '../../entities/index.js';
import { FilesService } from './files.service.js';

@Controller()
export class FilesController {
  constructor(private readonly files: FilesService) {}

  @Public()
  @Get('projects/:slug/files')
  list(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity | undefined,
  ): Promise<ProjectFile[]> {
    return this.files.list(slug, user);
  }

  @Post('projects/:slug/files')
  @HttpCode(201)
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('slug') slug: string,
    @CurrentUser() user: UserEntity,
    @UploadedFile() file?: Upload,
  ): Promise<ProjectFile> {
    return this.files.upload(slug, user, requireFile(file));
  }

  @Delete('files/:fileId')
  @HttpCode(204)
  remove(
    @Param('fileId', ParseUUIDPipe) fileId: string,
    @CurrentUser() user: UserEntity,
  ): Promise<void> {
    return this.files.remove(user, fileId);
  }
}
