import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus } from '../../../shared/enums/index.js';

export class UpdateConnectionDto {
  @ApiProperty({ enum: ConnectionStatus })
  @IsEnum(ConnectionStatus)
  status: ConnectionStatus;
}
