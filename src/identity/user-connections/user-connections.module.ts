import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserConnection } from './entities/user-connection.entity.js';
import { UserConnectionsService } from './user-connections.service.js';
import { UserConnectionsController } from './user-connections.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([UserConnection])],
  controllers: [UserConnectionsController],
  providers: [UserConnectionsService],
  exports: [UserConnectionsService],
})
export class UserConnectionsModule {}
