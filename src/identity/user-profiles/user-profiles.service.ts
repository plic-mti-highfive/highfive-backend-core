import { Injectable, NotFoundException } from '@nestjs/common';
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

    // Get followers (addressee=userId, status=ACCEPTED)
    const followerConnections = await this.userConnectionRepo.find({
      where: {
        addresseeId: userId,
        tenantId,
        status: ConnectionStatus.ACCEPTED,
      },
      relations: ['requester', 'requester.profile'],
    });

    const followers = followerConnections.map((c) => ({
      userId: c.requester.id,
      username: c.requester.email.split('@')[0],
      displayName:
        c.requester.profile?.displayName || c.requester.email.split('@')[0],
      avatar:
        c.requester.profile?.avatarPath ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.requester.id}`,
    }));

    // Get following (requester=userId, status=ACCEPTED)
    const followingConnections = await this.userConnectionRepo.find({
      where: {
        requesterId: userId,
        tenantId,
        status: ConnectionStatus.ACCEPTED,
      },
      relations: ['addressee', 'addressee.profile'],
    });

    const following = followingConnections.map((c) => ({
      userId: c.addressee.id,
      username: c.addressee.email.split('@')[0],
      displayName:
        c.addressee.profile?.displayName || c.addressee.email.split('@')[0],
      avatar:
        c.addressee.profile?.avatarPath ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${c.addressee.id}`,
    }));

    // Extract username from email
    const username = user.email.split('@')[0];

    return {
      userId,
      username,
      displayName: profile?.displayName || username,
      avatar:
        profile?.avatarPath ||
        `https://api.dicebear.com/7.x/avataaars/svg?seed=${userId}`,
      bio: profile?.bio || null,
      createdAt: user.createdAt.toISOString(),
      skills: profile?.skills || [],
      stats: { followers: followers.length, following: following.length },
      followers,
      following,
    };
  }

  async getSkillSuggestions(tenantId: string): Promise<string[]> {
    const rows = await this.profileRepo
      .createQueryBuilder('profile')
      .select('DISTINCT unnest(profile.skills)', 'skill')
      .where('profile.tenant_id = :tenantId', { tenantId })
      .andWhere(
        'profile.skills IS NOT NULL AND array_length(profile.skills, 1) > 0',
      )
      .getRawMany<{ skill: string }>();

    return rows.map((r) => r.skill).filter(Boolean);
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
