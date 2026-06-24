import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserProfile } from './entities/user-profile.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import {
  MinimalProfileDto,
  UserProfileResponseDto,
} from './dto/user-profile-response.dto.js';
import { UserProjectsResponseDto } from './dto/user-projects-response.dto.js';
import { User } from '../users/entities/user.entity.js';
import { UserConnection } from '../user-connections/entities/user-connection.entity.js';
import { ProjectMember } from '../../project-execution/project-members/entities/project-member.entity.js';
import { ProjectFollower } from '../../project-execution/project-members/entities/project-follower.entity.js';
import { ConnectionStatus, ProjectRole } from '@plic-mti-highfive/shared-types';
import { QueryProfileDto } from './dto/query-profile.dto.js';

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

  async createDefault(
    userId: string,
    tenantId: string,
    defaultDisplayName: string,
  ): Promise<UserProfile> {
    const profile = this.profileRepo.create({
      userId,
      tenantId,
      displayName: defaultDisplayName,
    });
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

  async findAll(
    tenantId: string,
    query: QueryProfileDto,
  ): Promise<{
    data: MinimalProfileDto[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const qb = this.profileRepo
      .createQueryBuilder('profile')
      .leftJoinAndSelect('profile.user', 'user')
      .where('profile.tenantId = :tenantId', { tenantId });

    if (query.search) {
      qb.andWhere(
        '(profile.displayName ILIKE :search OR user.email ILIKE :search)',
        {
          search: `%${query.search}%`,
        },
      );
    }

    if (query.tags && query.tags.length > 0) {
      qb.andWhere('profile.skills && ARRAY[:...skills]::varchar[]', {
        skills: query.tags,
      });
    }

    const order = query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
    switch (query.sortBy) {
      case 'name':
        qb.orderBy('profile.displayName', order);
        break;
      case 'popularity':
        // TODO: Implement popularity sorting based on followers count
        break;
      case 'date':
      default:
        qb.orderBy('user.createdAt', order);
        break;
    }

    const [data, total] = await qb.skip(offset).take(limit).getManyAndCount();

    const mappedData: MinimalProfileDto[] = data.map((p) => {
      const emailPrefix = p.user?.email.split('@')[0] ?? 'unknown';
      return {
        userId: p.userId,
        username: emailPrefix,
        displayName: p.displayName || emailPrefix,
        avatar:
          p.avatarPath ||
          `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.userId}`,
      };
    });

    return {
      data: mappedData,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}
