import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  ProjectRole,
  TicketStatus,
  type CanvasTokenPayload,
} from '@plic-mti-highfive/shared-types';
import { Canvas } from './entities/canvas.entity.js';
import { CanvasClientService } from './canvas-client.service.js';
import { AiTasksService } from './ai-tasks.service.js';
import {
  CanvasSessionDto,
  GenerateTasksResponseDto,
  ProposedTaskDto,
} from './dto/canvas.dto.js';
import { ProjectsService } from '../project-execution/projects/projects.service.js';
import { ProjectMembersService } from '../project-execution/project-members/project-members.service.js';
import { TicketsService } from '../project-execution/tickets/tickets.service.js';
import { Ticket } from '../project-execution/tickets/entities/ticket.entity.js';

/** Les roles projet ne sont pas ceux du canvas : on projette les uns sur les autres. */
const CANVAS_ROLE_BY_PROJECT_ROLE: Record<
  ProjectRole,
  CanvasTokenPayload['role']
> = {
  [ProjectRole.OWNER]: 'admin',
  [ProjectRole.ADMIN]: 'admin',
  [ProjectRole.MEMBER]: 'editor',
  [ProjectRole.VIEWER]: 'viewer',
};

const ALL_MEMBERS = [
  ProjectRole.OWNER,
  ProjectRole.ADMIN,
  ProjectRole.MEMBER,
  ProjectRole.VIEWER,
];
const CAN_EDIT = [ProjectRole.OWNER, ProjectRole.ADMIN, ProjectRole.MEMBER];

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(Canvas)
    private readonly canvasRepo: Repository<Canvas>,
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly membersService: ProjectMembersService,
    private readonly projectsService: ProjectsService,
    private readonly ticketsService: TicketsService,
    private readonly canvasClient: CanvasClientService,
    private readonly aiTasks: AiTasksService,
  ) {}

  /**
   * Ouvre une session sur le canvas du projet : cree le canvas au premier acces,
   * puis emet le JWT que le client passera au serveur Hocuspocus.
   *
   * C'est ici que se ferme le trou d'integration du service canvas : jusqu'a
   * present personne n'emettait ce token, et le canvas restait injoignable.
   */
  async openSession(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<CanvasSessionDto> {
    const member = await this.membersService.assertRole(
      tenantId,
      projectId,
      userId,
      ALL_MEMBERS,
    );

    const canvas = await this.getOrCreateDefault(tenantId, projectId);
    const role = CANVAS_ROLE_BY_PROJECT_ROLE[member.role];

    const payload: CanvasTokenPayload = {
      userId,
      tenantId,
      projectId,
      canvasId: canvas.id,
      role,
    };

    // Signe avec le secret du service canvas (et non celui des tokens d'API) :
    // ce sont deux audiences distinctes.
    const token = await this.jwtService.signAsync(
      { ...payload },
      {
        secret: this.config.get<string>('canvas.jwtSecret'),
        expiresIn: this.config.get<string>(
          'canvas.tokenExpiration',
        ) as unknown as number,
      },
    );

    return {
      canvasId: canvas.id,
      projectId,
      name: canvas.name,
      websocketUrl: this.config.get<string>('canvas.websocketUrl')!,
      token,
      role,
    };
  }

  async generateTasks(
    tenantId: string,
    projectId: string,
    canvasId: string,
    userId: string,
  ): Promise<GenerateTasksResponseDto> {
    await this.membersService.assertRole(tenantId, projectId, userId, CAN_EDIT);
    await this.assertCanvasBelongsToProject(tenantId, projectId, canvasId);

    const [project, canvas] = await Promise.all([
      this.projectsService.findById(tenantId, projectId),
      this.canvasClient.fetchExport(canvasId),
    ]);

    if (!this.aiTasks.hasEnoughMaterial(canvas)) {
      return { tasks: [], empty: true };
    }

    const tasks = await this.aiTasks.proposeTasks(
      { name: project.name, description: project.description },
      canvas,
    );

    return { tasks, empty: tasks.length === 0 };
  }

  /** Cree les tickets a partir des taches que l'utilisateur a retenues. */
  async acceptTasks(
    tenantId: string,
    projectId: string,
    canvasId: string,
    userId: string,
    tasks: ProposedTaskDto[],
  ): Promise<Ticket[]> {
    await this.membersService.assertRole(tenantId, projectId, userId, CAN_EDIT);
    await this.assertCanvasBelongsToProject(tenantId, projectId, canvasId);

    const created: Ticket[] = [];
    for (const task of tasks) {
      created.push(
        await this.ticketsService.create(tenantId, projectId, userId, {
          title: task.title,
          description: task.description || undefined,
          status: TicketStatus.TODO,
        }),
      );
    }
    return created;
  }

  private async getOrCreateDefault(
    tenantId: string,
    projectId: string,
  ): Promise<Canvas> {
    const existing = await this.canvasRepo.findOne({
      where: { tenantId, projectId },
      order: { createdAt: 'ASC' },
    });
    if (existing) return existing;

    return this.canvasRepo.save(
      this.canvasRepo.create({ tenantId, projectId }),
    );
  }

  /**
   * Sans cette verification, un membre d'un projet pourrait exporter le canvas
   * d'un autre projet en devinant son id.
   */
  private async assertCanvasBelongsToProject(
    tenantId: string,
    projectId: string,
    canvasId: string,
  ): Promise<void> {
    const canvas = await this.canvasRepo.findOne({
      where: { id: canvasId, tenantId, projectId },
    });
    if (!canvas) {
      throw new BadRequestException('Canvas does not belong to this project');
    }
  }
}
