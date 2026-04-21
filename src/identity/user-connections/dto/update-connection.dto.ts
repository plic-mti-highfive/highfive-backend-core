import { IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { ConnectionStatus } from '@plic-mti-highfive/shared-types';

export class UpdateConnectionDto {
  @ApiProperty({ enum: ConnectionStatus })
  @IsEnum(ConnectionStatus)
  status!: ConnectionStatus;
}
