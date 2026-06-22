import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserProfile } from './entities/user-profile.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UserProfileResponseDto } from './dto/user-profile-response.dto.js';
import { UserProjectsResponseDto } from './dto/user-projects-response.dto.js';
import { User } from '../users/entities/user.entity.js';
import { UserConnection } from '../user-connections/entities/user-connection.entity.js';
import { ProjectMember } from '../../project-execution/project-members/entities/project-member.entity.js';
import { ProjectFollower } from '../../project-execution/project-members/entities/project-follower.entity.js';
import { SkillsService } from '../skills/skills.service.js';
import { ConnectionStatus, ProjectRole } from '@plic-mti-highfive/shared-types';

@Injectable()
export class UserProfilesService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(UserConnection)
    private readonly userConnectionRepo: Repository<UserConnection>,
    @InjectRepository(ProjectMember)
    private readonly projectMemberRepo: Repository<ProjectMember>,
    @InjectRepository(ProjectFollower)
    private readonly projectFollowerRepo: Repository<ProjectFollower>,
    @Inject(SkillsService)
    private readonly skillsService: SkillsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async createDefault(userId: string, tenantId: string): Promise<UserProfile> {
    const profile = this.profileRepo.create({ userId, tenantId });
    return this.profileRepo.save(profile);
  }

  async findByUserId(tenantId: string, userId: string): Promise<UserProfile> {
    const profile = await this.profileRepo.findOne({
      where: { userId, tenantId },
    });
    if (!profile) throw new NotFoundException('Profile not found');
    return profile;
  }

  async update(
    tenantId: string,
    userId: string,
    dto: UpdateProfileDto,
  ): Promise<UserProfile> {
    const profile = await this.findByUserId(tenantId, userId);
    Object.assign(profile, dto);
    const saved = await this.profileRepo.save(profile);

    this.eventEmitter.emit('profile.updated', {
      userId,
      tenantId,
      changes: dto,
    });

    return saved;
  }

  async getEnrichedProfile(
    tenantId: string,
    userId: string,
  ): Promise<UserProfileResponseDto> {
    // Fetch profile and user
    const profile = await this.findByUserId(tenantId, userId);
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) throw new NotFoundException('User not found');

    // Get skills/tags
    const skills = await this.skillsService.findUserSkills(tenantId, userId);
    const tags = skills.map((skill) => skill.name);

    // Count followers (addressee=userId, status=ACCEPTED)
    const followersCount = await this.userConnectionRepo.count({
      where: {
        addresseeId: userId,
        tenantId,
        status: ConnectionStatus.ACCEPTED,
      },
    });

    // Count following (requester=userId, status=ACCEPTED)
    const followingCount = await this.userConnectionRepo.count({
      where: {
        requesterId: userId,
        tenantId,
        status: ConnectionStatus.ACCEPTED,
      },
    });

    // Extract username from email
    const username = user.email.split('@')[0];

    return {
      userId,
      username,
      displayName: username,
      avatar:
        profile.avatarPath ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      bio: profile.bio,
      createdAt: user.createdAt.toISOString(),
      tags,
      stats: {
        followers: followersCount,
        following: followingCount,
      },
    };
  }

  async getUserProjects(
    tenantId: string,
    userId: string,
  ): Promise<UserProjectsResponseDto> {
    // Get created projects (role = OWNER)
    const createdMembers = await this.projectMemberRepo.find({
      where: {
        userId,
        tenantId,
        role: ProjectRole.OWNER,
      },
      relations: ['project'],
    });

    const created = createdMembers
      .map((pm) => pm.project)
      .filter((p) => p && !p.deletedAt);

    // Get collaborations (role != OWNER)
    const collaborationMembers = await this.projectMemberRepo.find({
      where: {
        userId,
        tenantId,
      },
      relations: ['project'],
    });

    const collaborations = collaborationMembers
      .filter((pm) => pm.role !== ProjectRole.OWNER)
      .map((pm) => pm.project)
      .filter((p) => p && !p.deletedAt);

    // Get liked projects (ProjectFollower)
    const likedFollowers = await this.projectFollowerRepo.find({
      where: {
        userId,
        tenantId,
      },
      relations: ['project'],
    });

    const liked = likedFollowers
      .map((pf) => pf.project)
      .filter((p) => p && !p.deletedAt);

    return {
      created,
      collaborations,
      liked,
    };
  }
}
