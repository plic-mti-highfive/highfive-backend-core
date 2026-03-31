import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { UserProfile } from './entities/user-profile.entity.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

@Injectable()
export class UserProfilesService {
  constructor(
    @InjectRepository(UserProfile)
    private readonly profileRepo: Repository<UserProfile>,
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
}
