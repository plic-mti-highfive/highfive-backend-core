import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PasswordResetTokenEntity, UserEntity } from '../../entities/index.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, PasswordResetTokenEntity])],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
