import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GeneratePresignedUrlDto } from './dto/generate-presigned-url.dto';

@Injectable()
export class StorageService {
  private s3Client: S3Client;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName = this.configService.get<string>(
      'MINIO_BUCKET',
      'highfive-bucket',
    );

    this.s3Client = new S3Client({
      region: this.configService.get<string>('minio.region'),
      endpoint: this.configService.get<string>('minio.endpoint'),
      credentials: {
        accessKeyId: this.configService.get<string>(
          'minio.credentials.accessKeyId',
        )!,
        secretAccessKey: this.configService.get<string>(
          'minio.credentials.secretAccessKey',
        )!,
      },
      forcePathStyle: this.configService.get<boolean>('minio.forcePathStyle'),
    });
  }

  async generatePresignedUrl(
    tenantId: string,
    userId: string,
    dto: GeneratePresignedUrlDto,
  ) {
    try {
      const extension = dto.fileName.split('.').pop()?.toLowerCase();
      const filename = `${uuidv4()}.${extension}`;

      // Structure du path: tenantId / dossier / userId / fichier
      const fileKey = `${tenantId}/${dto.folder}/${userId}/${filename}`;

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileKey,
        ContentType: dto.mimeType,
      });

      const uploadUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 300,
      });

      const endpoint =
        this.configService.get<string>('minio.publicEndpoint') ||
        this.configService.get<string>('minio.endpoint');
      const publicUrl = `${endpoint}/${this.bucketName}/${fileKey}`;

      return {
        uploadUrl,
        publicUrl,
        fileKey,
      };
    } catch {
      throw new InternalServerErrorException(
        'Failed to generate presigned URL',
      );
    }
  }
}
