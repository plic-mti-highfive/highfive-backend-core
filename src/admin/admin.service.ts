import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository, MoreThan } from 'typeorm';
import {
  ProjectRole,
  ProjectStatus,
  UserStatus,
  ConnectionStatus,
} from '@plic-mti-highfive/shared-types';

import { User } from '../identity/users/entities/user.entity.js';
import { UserConnection } from '../identity/user-connections/entities/user-connection.entity.js';
import { Tenant } from '../identity/tenants/entities/tenant.entity.js';
import { RefreshToken } from '../identity/auth/entities/refresh-token.entity.js';
import { Project } from '../project-execution/projects/entities/project.entity.js';
import { ProjectMember } from '../project-execution/project-members/entities/project-member.entity.js';
import { ProjectHighfive } from '../project-execution/project-highfives/entities/project-highfive.entity.js';
import { SystemRole } from '../shared/auth/system-role.enum.js';

import {
  AdminProjectDto,
  AdminProjectStatus,
  AdminStatsDto,
  AdminTenantDto,
  AdminUserDto,
  DailyRegistrationDto,
  RecentlyClosedProjectDto,
} from './dto/admin-response.dto.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const FR_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
];

/**
 * Service du dashboard admin plateforme. Toutes les requêtes sur des données
 * utilisateur/projet sont scopées au tenant courant (invariant multi-tenant) ;
 * seule la liste des tenants est, par nature, transverse.
 */
@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserConnection)
    private readonly connectionRepo: Repository<UserConnection>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Project)
    private readonly projectRepo: Repository<Project>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectHighfive)
    private readonly highfiveRepo: Repository<ProjectHighfive>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ── Stats ────────────────────────────────────────────────────────────────

  async getStats(tenantId: string): Promise<AdminStatsDto> {
    const weekAgo = new Date(Date.now() - 7 * DAY_MS);
    const now = new Date();

    const [
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      newUsersThisWeek,
      totalProjects,
      activeProjects,
      newProjectsThisWeek,
      totalTenants,
      onlineUsers,
    ] = await Promise.all([
      this.userRepo.count({ where: { tenantId } }),
      this.userRepo.count({ where: { tenantId, status: UserStatus.ACTIVE } }),
      this.userRepo.count({ where: { tenantId, status: UserStatus.PENDING } }),
      this.userRepo.count({
        where: { tenantId, status: UserStatus.SUSPENDED },
      }),
      this.userRepo.count({
        where: { tenantId, createdAt: MoreThan(weekAgo) },
      }),
      this.projectRepo.count({ where: { tenantId } }),
      this.projectRepo.count({
        where: { tenantId, status: ProjectStatus.ACTIVE },
      }),
      this.projectRepo.count({
        where: { tenantId, createdAt: MoreThan(weekAgo) },
      }),
      this.tenantRepo.count(),
      this.countOnlineUsers(tenantId, now),
    ]);

    return {
      totalUsers,
      activeUsers,
      pendingUsers,
      suspendedUsers,
      totalProjects,
      activeProjects,
      totalTenants,
      newUsersThisWeek,
      newProjectsThisWeek,
      onlineUsers,
    };
  }

  /**
   * Proxy de présence : utilisateurs distincts disposant d'un refresh token
   * encore valide (non révoqué, non expiré). Faute de canal temps réel côté
   * core backend, c'est l'approximation la plus fiable de "connectés".
   */
  private async countOnlineUsers(tenantId: string, now: Date): Promise<number> {
    const raw: unknown = await this.refreshTokenRepo
      .createQueryBuilder('rt')
      .select('COUNT(DISTINCT rt.user_id)', 'count')
      .where('rt.tenant_id = :tenantId', { tenantId })
      .andWhere('rt.revoked = false')
      .andWhere('rt.expires_at > :now', { now })
      .getRawOne();
    return Number((raw as { count?: string } | undefined)?.count ?? 0);
  }

  async getDailyRegistrations(
    tenantId: string,
    days = 30,
  ): Promise<DailyRegistrationDto[]> {
    const since = new Date(Date.now() - (days - 1) * DAY_MS);
    since.setHours(0, 0, 0, 0);

    const users = await this.userRepo.find({
      where: { tenantId, createdAt: MoreThan(since) },
      select: ['id', 'createdAt'],
    });

    // Bucket par jour (clé = yyyy-mm-dd) initialisé à 0 sur toute la fenêtre.
    const buckets = new Map<string, number>();
    for (let i = 0; i < days; i++) {
      const d = new Date(since.getTime() + i * DAY_MS);
      buckets.set(this.dayKey(d), 0);
    }
    for (const u of users) {
      const key = this.dayKey(new Date(u.createdAt));
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return [...buckets.entries()].map(([key, inscriptions]) => ({
      date: this.shortLabel(new Date(key)),
      inscriptions,
    }));
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async getUsers(tenantId: string): Promise<AdminUserDto[]> {
    const users = await this.userRepo.find({
      where: { tenantId },
      relations: ['profile'],
      order: { createdAt: 'DESC' },
    });

    const projectsByUser = await this.countProjectsByUser(tenantId);
    const followersByUser = await this.countFollowersByUser(tenantId);

    return users.map((u) => ({
      id: u.id,
      email: u.email,
      username: u.profile?.displayName ?? u.email.split('@')[0],
      status: u.status,
      projectsCount: projectsByUser.get(u.id) ?? 0,
      followersCount: followersByUser.get(u.id) ?? 0,
      joinedAt: u.createdAt,
    }));
  }

  async updateUserStatus(
    tenantId: string,
    userId: string,
    status: UserStatus,
  ): Promise<AdminUserDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException('User not found');

    user.status = status;
    await this.userRepo.save(user);

    this.eventEmitter.emit('admin.user.status.changed', {
      tenantId,
      userId,
      status,
    });

    return {
      id: user.id,
      email: user.email,
      username: user.profile?.displayName ?? user.email.split('@')[0],
      status: user.status,
      projectsCount: 0,
      followersCount: 0,
      joinedAt: user.createdAt,
    };
  }

  async updateUserRole(
    tenantId: string,
    userId: string,
    role: SystemRole,
  ): Promise<AdminUserDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException('User not found');

    user.systemRole = role;
    await this.userRepo.save(user);

    this.eventEmitter.emit('admin.user.role.changed', {
      tenantId,
      userId,
      role,
    });

    return {
      id: user.id,
      email: user.email,
      username: user.profile?.displayName ?? user.email.split('@')[0],
      status: user.status,
      projectsCount: 0,
      followersCount: 0,
      joinedAt: user.createdAt,
    };
  }

  async deleteUser(tenantId: string, userId: string): Promise<void> {
    const result = await this.userRepo.softDelete({ id: userId, tenantId });
    if (result.affected === 0) throw new NotFoundException('User not found');

    this.eventEmitter.emit('admin.user.deleted', { tenantId, userId });
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async getProjects(tenantId: string): Promise<AdminProjectDto[]> {
    const projects = await this.projectRepo.find({
      where: { tenantId },
      order: { createdAt: 'DESC' },
    });
    return Promise.all(projects.map((p) => this.toAdminProject(p)));
  }

  async getRecentlyClosedProjects(
    tenantId: string,
    limit = 5,
  ): Promise<RecentlyClosedProjectDto[]> {
    const projects = await this.projectRepo.find({
      where: { tenantId, status: ProjectStatus.ARCHIVED },
      order: { updatedAt: 'DESC' },
      take: limit,
    });

    return Promise.all(
      projects.map(async (p) => {
        const [ownerUsername, membersCount, highfiveCount] = await Promise.all([
          this.resolveOwnerUsername(tenantId, p.id),
          this.memberRepo.count({ where: { projectId: p.id, tenantId } }),
          this.highfiveRepo.count({ where: { projectId: p.id, tenantId } }),
        ]);
        return {
          id: p.id,
          name: p.name,
          ownerUsername,
          closedAt: p.updatedAt,
          membersCount,
          highfiveCount,
        };
      }),
    );
  }

  /** Bascule entre ACTIVE et ARCHIVED. Retourne le projet mis à jour. */
  async toggleArchiveProject(
    tenantId: string,
    projectId: string,
  ): Promise<AdminProjectDto> {
    const project = await this.projectRepo.findOne({
      where: { id: projectId, tenantId },
    });
    if (!project) throw new NotFoundException('Project not found');

    project.status =
      project.status === ProjectStatus.ARCHIVED
        ? ProjectStatus.ACTIVE
        : ProjectStatus.ARCHIVED;
    await this.projectRepo.save(project);

    this.eventEmitter.emit('admin.project.status.changed', {
      tenantId,
      projectId,
      status: project.status,
    });

    return this.toAdminProject(project);
  }

  async deleteProject(tenantId: string, projectId: string): Promise<void> {
    const result = await this.projectRepo.softDelete({
      id: projectId,
      tenantId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('Project not found');
    }

    this.eventEmitter.emit('admin.project.deleted', { tenantId, projectId });
  }

  // ── Tenants ──────────────────────────────────────────────────────────────

  async getTenants(): Promise<AdminTenantDto[]> {
    const tenants = await this.tenantRepo.find({
      order: { createdAt: 'DESC' },
    });

    return Promise.all(
      tenants.map(async (t) => {
        const [usersCount, projectsCount] = await Promise.all([
          this.userRepo.count({ where: { tenantId: t.id } }),
          this.projectRepo.count({ where: { tenantId: t.id } }),
        ]);
        return {
          id: t.id,
          name: t.name,
          domain: t.domain,
          usersCount,
          projectsCount,
          createdAt: t.createdAt,
        };
      }),
    );
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async toAdminProject(project: Project): Promise<AdminProjectDto> {
    const [ownerUsername, membersCount, highfiveCount] = await Promise.all([
      this.resolveOwnerUsername(project.tenantId, project.id),
      this.memberRepo.count({
        where: { projectId: project.id, tenantId: project.tenantId },
      }),
      this.highfiveRepo.count({
        where: { projectId: project.id, tenantId: project.tenantId },
      }),
    ]);

    const status: AdminProjectStatus =
      project.status === ProjectStatus.ARCHIVED ? 'archived' : 'active';

    return {
      id: project.id,
      name: project.name,
      description: project.description ?? '',
      ownerUsername,
      membersCount,
      highfiveCount,
      createdAt: project.createdAt,
      status,
    };
  }

  private async resolveOwnerUsername(
    tenantId: string,
    projectId: string,
  ): Promise<string> {
    const owner = await this.memberRepo.findOne({
      where: { projectId, tenantId, role: ProjectRole.OWNER },
      relations: ['user', 'user.profile'],
    });
    if (!owner?.user) return '—';
    return owner.user.profile?.displayName ?? owner.user.email.split('@')[0];
  }

  private async countProjectsByUser(
    tenantId: string,
  ): Promise<Map<string, number>> {
    const rows = await this.memberRepo
      .createQueryBuilder('pm')
      .select('pm.user_id', 'userId')
      .addSelect('COUNT(*)', 'count')
      .where('pm.tenant_id = :tenantId', { tenantId })
      .groupBy('pm.user_id')
      .getRawMany<{ userId: string; count: string }>();
    return new Map(rows.map((r) => [r.userId, Number(r.count)]));
  }

  /**
   * "Abonnés" d'un utilisateur = connexions acceptées le concernant
   * (qu'il soit demandeur ou destinataire).
   */
  private async countFollowersByUser(
    tenantId: string,
  ): Promise<Map<string, number>> {
    const connections = await this.connectionRepo.find({
      where: { tenantId, status: ConnectionStatus.ACCEPTED },
      select: ['requesterId', 'addresseeId'],
    });
    const counts = new Map<string, number>();
    const bump = (id: string) => counts.set(id, (counts.get(id) ?? 0) + 1);
    for (const c of connections) {
      bump(c.requesterId);
      bump(c.addresseeId);
    }
    return counts;
  }

  private dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private shortLabel(d: Date): string {
    return `${String(d.getDate()).padStart(2, '0')} ${FR_MONTHS[d.getMonth()]}`;
  }
}
