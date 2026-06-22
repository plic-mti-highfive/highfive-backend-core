import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum StorageFolder {
  AVATARS = 'avatars',
  BANNERS = 'banners',
  PROJECTS = 'projects',
}

export class GeneratePresignedUrlDto {
  @ApiProperty({ description: 'File name' })
  @IsString()
  @IsNotEmpty()
  fileName: string;

  @ApiProperty({ description: 'File MIME type' })
  @IsString()
  @IsNotEmpty()
  mimeType: string;

  @ApiProperty({ enum: StorageFolder, description: 'Storage folder' })
  @IsEnum(StorageFolder)
  folder: StorageFolder;
}
