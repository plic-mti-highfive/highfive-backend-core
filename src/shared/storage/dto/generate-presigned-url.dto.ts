import { IsEnum, IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { StorageFolder } from '@plic-mti-highfive/shared-types';

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
