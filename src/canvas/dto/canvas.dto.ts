import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsNotEmpty,
  IsString,
  ValidateNested,
  ArrayMaxSize,
  ArrayNotEmpty,
} from 'class-validator';
import type { ProposedTask } from '@plic-mti-highfive/shared-types';

export class CanvasSessionDto {
  @ApiProperty()
  canvasId!: string;

  @ApiProperty()
  projectId!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ description: 'URL WebSocket du serveur canvas' })
  websocketUrl!: string;

  @ApiProperty({ description: 'JWT a passer au provider Hocuspocus' })
  token!: string;

  @ApiProperty({ enum: ['admin', 'editor', 'viewer'] })
  role!: 'admin' | 'editor' | 'viewer';
}

export class ProposedTaskDto implements ProposedTask {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  title!: string;

  @ApiProperty()
  @IsString()
  description!: string;

  @ApiProperty({
    type: [String],
    description: 'Elements du canvas qui ont motive la tache',
  })
  @IsArray()
  @IsString({ each: true })
  sourceHints!: string[];
}

export class GenerateTasksResponseDto {
  @ApiProperty({ type: [ProposedTaskDto] })
  tasks!: ProposedTaskDto[];

  @ApiProperty({
    description:
      'Vrai quand le canvas ne contient pas assez de matiere pour proposer quoi que ce soit',
  })
  empty!: boolean;
}

/**
 * L'utilisateur valide (et peut avoir edite) les taches proposees avant creation.
 * Rien n'est persiste a l'etape de generation : le client renvoie ici ce qu'il
 * garde, ce qui evite qu'une proposition ratee pollue le projet.
 */
export class AcceptTasksDto {
  @ApiProperty({ type: [ProposedTaskDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ProposedTaskDto)
  tasks!: ProposedTaskDto[];
}
