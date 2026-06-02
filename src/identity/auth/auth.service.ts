import {
  Injectable,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { randomBytes, createHash } from 'crypto';

import { UsersService } from '../users/users.service.js';
import { UserProfilesService } from '../user-profiles/user-profiles.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { AuthResponseDto } from './dto/auth-response.dto.js';
import { UserResponseDto } from '../users/dto/user-response.dto.js';
import { User } from '../users/entities/user.entity.js';
import { UserStatus } from '@plic-mti-highfive/shared-types';
import { JwtPayload } from '../../shared/auth/jwt.strategy.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly userProfilesService: UserProfilesService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
  ) {}

  async register(tenantId: string, dto: RegisterDto): Promise<AuthResponseDto> {
    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.create(
      tenantId,
      dto.email,
      passwordHash,
    );

    await this.userProfilesService.createDefault(user.id, tenantId);

    this.eventEmitter.emit('user.registered', {
      userId: user.id,
      email: user.email,
      tenantId,
    });

    return this.generateTokens(user);
  }

  async login(tenantId: string, dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.usersService.findByEmail(tenantId, dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account is suspended');
    }

    const valid = await argon2.verify(user.passwordHash, dto.password);
    if (!valid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    this.eventEmitter.emit('user.logged_in', {
      userId: user.id,
      email: user.email,
      tenantId,
    });

    return this.generateTokens(user);
  }

  async refresh(
    tenantId: string,
    refreshTokenRaw: string,
  ): Promise<AuthResponseDto> {
    const tokenHash = this.hashToken(refreshTokenRaw);

    const stored = await this.refreshTokenRepo.findOne({
      where: { tokenHash, tenantId, revoked: false },
      relations: ['user'],
    });

    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    if (stored.user.status === UserStatus.SUSPENDED) {
      throw new ForbiddenException('Account is suspended');
    }

    stored.revoked = true;
    await this.refreshTokenRepo.save(stored);

    return this.generateTokens(stored.user);
  }

  async getProfile(tenantId: string, userId: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(tenantId, userId);
    return UserResponseDto.fromUser(user);
  }

  async logout(tenantId: string, refreshTokenRaw: string): Promise<void> {
    const tokenHash = this.hashToken(refreshTokenRaw);
    await this.refreshTokenRepo.update(
      { tokenHash, tenantId },
      { revoked: true },
    );

    this.eventEmitter.emit('user.logged_out', { tenantId });
  }

  private async generateTokens(user: User): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      tenantId: user.tenantId,
      role: user.systemRole,
    };

    const accessToken = this.jwtService.sign(
      { ...payload },
      {
        secret: this.configService.get<string>('jwt.accessSecret'),
        expiresIn: this.configService.get<string>(
          'jwt.accessExpiration',
        ) as unknown as number,
      },
    );

    const refreshTokenRaw = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(refreshTokenRaw);

    const expiresAt = new Date();
    const refreshExpStr =
      this.configService.get<string>('jwt.refreshExpiration') ?? '7d';
    const days = parseInt(refreshExpStr.replace('d', ''), 10) || 7;
    expiresAt.setDate(expiresAt.getDate() + days);

    const refreshEntity = this.refreshTokenRepo.create({
      userId: user.id,
      tenantId: user.tenantId,
      tokenHash,
      expiresAt,
    });
    await this.refreshTokenRepo.save(refreshEntity);

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      user: UserResponseDto.fromUser(user),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
