import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({ example: 'EPITA' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'epita.highfive.app' })
  @IsString()
  @IsNotEmpty()
  domain!: string;
}
