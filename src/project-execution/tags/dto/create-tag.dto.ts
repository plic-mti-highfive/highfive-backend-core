import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTagDto {
  @ApiProperty({ example: 'machine-learning' })
  @IsString()
  @IsNotEmpty()
  name: string;
}
