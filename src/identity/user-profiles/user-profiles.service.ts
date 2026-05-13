import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserProfile } from './entities/user-profile.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserProfileResponseDto } from './dto/user-profile-response.dto.js';
import { User } from '../users/entities/user.entity.js';
import { UserSkill } from '../skills/entities/user-skill.entity.js';
import { UserConnection } from '../user-connections/entities/user-connection.entity.js';
import { ProjectMember } from '../../project-execution/project-members/entities/project-member.entity.js';
import { ConnectionStatus, ProjectRole } from '@plic-mti-highfive/shared-types';
import { ProjectsService } from '../../project-execution/projects/projects.service.js';
import { ProjectHighfivesService } from '../../project-execution/project-highfives/project-highfives.service.js';

@Injectable()
export class UserProfilesService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserSkill)
    private readonly userSkillRepo: Repository<UserSkill>,
    @InjectRepository(UserConnection)
    private readonly connectionRepo: Repository<UserConnection>,
    @InjectRepository(ProjectMember)
    private readonly memberRepo: Repository<ProjectMember>,
    private readonly projectsService: ProjectsService,
    private readonly highfivesService: ProjectHighfivesService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createDefault(userId: string, tenantId: string): Promise<UserProfile> {
    const profile = this.profileRepo.create({ userId, tenantId });
    return this.profileRepo.save(profile);
  }

  async findByUserId(
    tenantId: string,
    userId: string,
  ): Promise<UserProfileResponseDto> {
    const [profile, user] = await Promise.all([
      this.profileRepo.findOne({ where: { userId, tenantId } }),
      this.userRepo.findOne({ where: { id: userId, tenantId } }),
    ]);
    if (!profile || !user) throw new NotFoundException('Profile not found');

    const [userSkills, memberships, followers, following, likedProjectIds] =
      await Promise.all([
        this.userSkillRepo.find({
          where: { userId, tenantId },
          relations: ['skill'],
        }),
        this.memberRepo.find({ where: { userId, tenantId } }),
        this.connectionRepo.count({
          where: {
            addresseeId: userId,
            tenantId,
            status: ConnectionStatus.ACCEPTED,
          },
        }),
        this.connectionRepo.count({
          where: {
            requesterId: userId,
            tenantId,
            status: ConnectionStatus.ACCEPTED,
          },
        }),
        this.highfivesService.findLikedProjectIds(tenantId, userId),
      ]);

    const ownedIds = memberships
      .filter((m) => m.role === ProjectRole.OWNER)
      .map((m) => m.projectId);
    const contribIds = memberships
      .filter((m) => m.role !== ProjectRole.OWNER)
      .map((m) => m.projectId);

    const [created, collaborations, liked] = await Promise.all([
      this.projectsService.findManyByIds(tenantId, ownedIds),
      this.projectsService.findManyByIds(tenantId, contribIds),
      this.projectsService.findManyByIds(tenantId, likedProjectIds),
    ]);

    return {
      userId: profile.userId,
      tenantId: profile.tenantId,
      email: user.email,
      displayName: profile.displayName ?? user.email.split('@')[0],
      bio: profile.bio,
      avatarPath: profile.avatarPath,
      themePreference: profile.themePreference,
      emailNotifications: profile.emailNotifications,
      skills: userSkills.map((us) => ({
        id: us.skill.id,
        name: us.skill.name,
      })),
      stats: {
        projectsCreated: ownedIds.length,
        projectsContributed: contribIds.length,
        followers,
        following,
      },
      projects: { created, collaborations, liked },
    };
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({
      where: { userId, tenantId },
    });
    if (!profile) throw new NotFoundException('Profile not found');

    Object.assign(profile, dto);
    const saved = await this.profileRepo.save(profile);

    this.eventEmitter.emit('profile.updated', {
      userId,
      tenantId,
      changes: dto,
    });

    return saved;
  }
}
