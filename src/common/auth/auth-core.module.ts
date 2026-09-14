import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SessionEntity, UserEntity } from '../../entities/index.js';
import { SessionService } from './session.service.js';

/**
 * Les sessions sont lues par la garde globale : le service est donc fourni
 * globalement plutot qu'importe par chaque module qui en aurait besoin.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity, UserEntity])],
  providers: [SessionService],
  exports: [SessionService],
})
export class AuthCoreModule {}
