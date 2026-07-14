import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Mock } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { UserProfilesService } from '../user-profiles/user-profiles.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { User } from '../users/entities/user.entity.js';
import { UserStatus } from '@plic-mti-highfive/shared-types';

type UsersServiceMock = {
  create: Mock<UsersService['create']>;
  findByEmail: Mock<UsersService['findByEmail']>;
};

type UserProfilesServiceMock = {
  createDefault: Mock<UserProfilesService['createDefault']>;
};

type JwtServiceMock = {
  sign: Mock<(payload: object, options?: object) => string>;
};

type RefreshTokenRepoMock = {
  create: Mock<(data: Partial<RefreshToken>) => Partial<RefreshToken>>;
  save: Mock<(data: Partial<RefreshToken>) => Partial<RefreshToken>>;
  findOne: Mock<() => Promise<RefreshToken | null>>;
  update: Mock<() => Promise<unknown>>;
};

type EventEmitterMock = {
  emit: Mock<(event: string, payload: unknown) => boolean>;
};

describe('AuthService', () => {
  let service: AuthService;
  let usersService: UsersServiceMock;
  let userProfilesService: UserProfilesServiceMock;
  let jwtService: JwtServiceMock;
  let refreshTokenRepo: RefreshTokenRepoMock;
  let eventEmitter: EventEmitterMock;

  const tenantId = 'tenant-1';
  const mockUser: User = {
    id: 'user-1',
    email: 'test@epita.fr',
    passwordHash: '',
    tenantId,
    status: UserStatus.ACTIVE,
  } as User;

  beforeEach(async () => {
    mockUser.passwordHash = await argon2.hash('SecureP@ss123');

    usersService = {
      create: vi.fn<UsersService['create']>().mockResolvedValue(mockUser),
      findByEmail: vi.fn<UsersService['findByEmail']>(),
    };

    userProfilesService = {
      createDefault: vi
        .fn<UserProfilesService['createDefault']>()
        .mockResolvedValue(
          {} as Awaited<ReturnType<UserProfilesService['createDefault']>>,
        ),
    };

    jwtService = {
      sign: vi
        .fn<(payload: object, options?: object) => string>()
        .mockReturnValue('mock-access-token'),
    };

    refreshTokenRepo = {
      create: vi
        .fn<(data: Partial<RefreshToken>) => Partial<RefreshToken>>()
        .mockImplementation((data: Partial<RefreshToken>) => data),
      save: vi
        .fn<(data: Partial<RefreshToken>) => Partial<RefreshToken>>()
        .mockImplementation((data: Partial<RefreshToken>) => ({
          id: 'rt-1',
          ...data,
        })),
      findOne: vi.fn<() => Promise<RefreshToken | null>>(),
      update: vi.fn<() => Promise<unknown>>(),
    };

    eventEmitter = {
      emit: vi.fn<(event: string, payload: unknown) => boolean>(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: JwtService, useValue: jwtService },
        { provide: EventEmitter2, useValue: eventEmitter },
        {
          provide: ConfigService,
          useValue: {
            get: vi.fn((key: string) => {
              const map: Record<string, string> = {
                'jwt.accessSecret': 'test-secret',
                'jwt.accessExpiration': '15m',
                'jwt.refreshSecret': 'test-refresh',
                'jwt.refreshExpiration': '7d',
              };
              return map[key];
            }),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepo,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  describe('register', () => {
    it('should create user, profile, and return tokens', async () => {
      const result = await service.register(tenantId, {
        email: 'test@epita.fr',
        password: 'SecureP@ss123',
      });

      expect(usersService.create).toHaveBeenCalled();
      expect(userProfilesService.createDefault).toHaveBeenCalledWith(
        'user-1',
        tenantId,
      );
      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
    });
  });

  describe('login', () => {
    it('should return tokens for valid credentials', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      const result = await service.login(tenantId, {
        email: 'test@epita.fr',
        password: 'SecureP@ss123',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw on invalid email', async () => {
      usersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login(tenantId, {
          email: 'wrong@epita.fr',
          password: 'SecureP@ss123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on invalid password', async () => {
      usersService.findByEmail.mockResolvedValue(mockUser);

      await expect(
        service.login(tenantId, {
          email: 'test@epita.fr',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for suspended user', async () => {
      usersService.findByEmail.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      });

      await expect(
        service.login(tenantId, {
          email: 'test@epita.fr',
          password: 'SecureP@ss123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
