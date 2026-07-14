import { Controller, Post, Body } from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
} from '@nestjs/swagger';
import { StorageService } from './storage.service.js';
import { GeneratePresignedUrlDto } from './dto/generate-presigned-url.dto.js';
import type { UserContext } from '@plic-mti-highfive/shared-types';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { TenantId } from '../tenant/tenant.decorator.js';

@ApiTags('Storage')
@ApiBearerAuth()
@ApiSecurity('tenant')
@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('presigned-url')
  @ApiOperation({
    summary: 'Génère une URL S3/MinIO signée pour uploader un fichier',
  })
  async getPresignedUrl(
    @TenantId() tenantId: string,
    @CurrentUser() user: UserContext,
    @Body() dto: GeneratePresignedUrlDto,
  ) {
    return this.storageService.generatePresignedUrl(tenantId, user.id, dto);
  }
}
