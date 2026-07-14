import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity.js';
import { UserStatus } from '@plic-mti-highfive/shared-types';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async create(
    tenantId: string,
    email: string,
    passwordHash: string,
  ): Promise<User> {
    const existing = await this.userRepo.findOne({
      where: { email, tenantId },
    });
    if (existing) {
      throw new ConflictException('Email already registered in this tenant');
    }

    const user = this.userRepo.create({
      tenantId,
      email,
      passwordHash,
      status: UserStatus.ACTIVE,
    });
    return this.userRepo.save(user);
  }

  async findByEmail(tenantId: string, email: string): Promise<User | null> {
    return this.userRepo.findOne({
      where: { email, tenantId },
      relations: ['profile'],
    });
  }

  async findById(tenantId: string, id: string): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id, tenantId },
      relations: ['profile'],
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findActiveById(tenantId: string, id: string): Promise<User> {
    const user = await this.findById(tenantId, id);
    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('User account is suspended');
    }
    return user;
  }
}
