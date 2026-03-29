import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectMember } from './entities/project-member.entity.js';
import { ProjectRole } from '../../shared/enums/index.js';
import { AddMemberDto } from './dto/add-member.dto.js';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto.js';
import { UsersService } from '../../identity/users/users.service.js';

const MANAGE_ROLES = [ProjectRole.OWNER, ProjectRole.ADMIN];

@Injectable()
export class ProjectMembersService {
  constructor(
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    private readonly usersService: UsersService,
  ) {}

  async addOwner(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMember> {
    const member = this.memberRepo.create({
      projectId,
      userId,
      tenantId,
      role: ProjectRole.OWNER,
    });
    return this.memberRepo.save(member);
  }

  async addMember(
    tenantId: string,
    projectId: string,
    actorId: string,
    dto: AddMemberDto,
  ): Promise<ProjectMember> {
    await this.assertRole(tenantId, projectId, actorId, MANAGE_ROLES);
    await this.usersService.findActiveById(tenantId, dto.userId);

    const existing = await this.memberRepo.findOne({
      where: { projectId, userId: dto.userId, tenantId },
    });
    if (existing) throw new ConflictException('User is already a member');

    const member = this.memberRepo.create({
      projectId,
      userId: dto.userId,
      tenantId,
      role: dto.role,
    });
    return this.memberRepo.save(member);
  }

  async updateRole(
    tenantId: string,
    projectId: string,
    actorId: string,
    targetUserId: string,
    dto: UpdateMemberRoleDto,
  ): Promise<ProjectMember> {
    await this.assertRole(tenantId, projectId, actorId, MANAGE_ROLES);

    const member = await this.memberRepo.findOne({
      where: { projectId, userId: targetUserId, tenantId },
    });
    if (!member) throw new NotFoundException('Member not found');

    member.role = dto.role;
    return this.memberRepo.save(member);
  }

  async removeMember(
    tenantId: string,
    projectId: string,
    actorId: string,
    targetUserId: string,
  ): Promise<void> {
    await this.assertRole(tenantId, projectId, actorId, MANAGE_ROLES);

    const result = await this.memberRepo.delete({
      projectId,
      userId: targetUserId,
      tenantId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('Member not found');
    }
  }

  async findMembers(
    tenantId: string,
    projectId: string,
  ): Promise<ProjectMember[]> {
    return this.memberRepo.find({
      where: { projectId, tenantId },
      relations: ['user'],
    });
  }

  async getMemberRole(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMember | null> {
    return this.memberRepo.findOne({
      where: { projectId, userId, tenantId },
    });
  }

  async assertRole(
    tenantId: string,
    projectId: string,
    userId: string,
    allowedRoles: ProjectRole[],
  ): Promise<ProjectMember> {
    const member = await this.getMemberRole(tenantId, projectId, userId);
    if (!member || !allowedRoles.includes(member.role)) {
      throw new ForbiddenException('Insufficient project role');
    }
    return member;
  }

  async assertMember(
    tenantId: string,
    projectId: string,
    userId: string,
  ): Promise<ProjectMember> {
    const member = await this.getMemberRole(tenantId, projectId, userId);
    if (!member) {
      throw new ForbiddenException('Not a member of this project');
    }
    return member;
  }
}
