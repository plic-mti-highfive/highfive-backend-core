import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';

import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { RefreshToken } from './entities/refresh-token.entity.js';
import { JwtStrategy } from '../../shared/auth/jwt.strategy.js';
import { UsersModule } from '../users/users.module.js';
import { UserProfilesModule } from '../user-profiles/user-profiles.module.js';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}),
    TypeOrmModule.forFeature([RefreshToken]),
    ConfigModule,
    UsersModule,
    UserProfilesModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
