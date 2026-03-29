import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service.js';
import { UsersService } from '../users/users.service.js';
import { UserProfilesService } from '../user-profiles/user-profiles.service.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { UserStatus } from '../../shared/enums/index.js';

describe('AuthService', () => {
  let service: AuthService;
  let usersService: jest.Mocked<Partial<UsersService>>;
  let userProfilesService: jest.Mocked<Partial<UserProfilesService>>;
  let jwtService: jest.Mocked<Partial<JwtService>>;
  let refreshTokenRepo: any;

  const tenantId = 'tenant-1';
  const mockUser = {
    id: 'user-1',
    email: 'test@epita.fr',
    passwordHash: '',
    tenantId,
    status: UserStatus.ACTIVE,
  };

  beforeEach(async () => {
    mockUser.passwordHash = await argon2.hash('SecureP@ss123');

    usersService = {
      create: jest.fn().mockResolvedValue(mockUser),
      findByEmail: jest.fn(),
    };

    userProfilesService = {
      createDefault: jest.fn().mockResolvedValue({}),
    };

    jwtService = {
      sign: jest.fn().mockReturnValue('mock-access-token'),
    };

    refreshTokenRepo = {
      create: jest.fn().mockImplementation((data) => data),
      save: jest.fn().mockImplementation((data) => ({ id: 'rt-1', ...data })),
      findOne: jest.fn(),
      update: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: usersService },
        { provide: UserProfilesService, useValue: userProfilesService },
        { provide: JwtService, useValue: jwtService },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
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
      usersService.findByEmail!.mockResolvedValue(mockUser as any);

      const result = await service.login(tenantId, {
        email: 'test@epita.fr',
        password: 'SecureP@ss123',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('should throw on invalid email', async () => {
      usersService.findByEmail!.mockResolvedValue(null);

      await expect(
        service.login(tenantId, {
          email: 'wrong@epita.fr',
          password: 'SecureP@ss123',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw on invalid password', async () => {
      usersService.findByEmail!.mockResolvedValue(mockUser as any);

      await expect(
        service.login(tenantId, {
          email: 'test@epita.fr',
          password: 'WrongPassword',
        }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw for suspended user', async () => {
      usersService.findByEmail!.mockResolvedValue({
        ...mockUser,
        status: UserStatus.SUSPENDED,
      } as any);

      await expect(
        service.login(tenantId, {
          email: 'test@epita.fr',
          password: 'SecureP@ss123',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
