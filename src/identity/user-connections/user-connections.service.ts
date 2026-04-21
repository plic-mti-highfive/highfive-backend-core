import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserConnection } from './entities/user-connection.entity.js';
import { ConnectionStatus } from '@plic-mti-highfive/shared-types';
import { CreateConnectionDto } from './dto/create-connection.dto.js';
import { UpdateConnectionDto } from './dto/update-connection.dto.js';

@Injectable()
export class UserConnectionsService {
  constructor(
    @InjectRepository(UserConnection)
    private readonly connectionRepo: Repository<UserConnection>,
  ) {}

  async create(
    tenantId: string,
    requesterId: string,
    dto: CreateConnectionDto,
  ): Promise<UserConnection> {
    if (requesterId === dto.addresseeId) {
      throw new BadRequestException('Cannot connect with yourself');
    }

    const existing = await this.connectionRepo.findOne({
      where: [
        { requesterId, addresseeId: dto.addresseeId, tenantId },
        { requesterId: dto.addresseeId, addresseeId: requesterId, tenantId },
      ],
    });
    if (existing) {
      throw new ConflictException('Connection already exists');
    }

    const connection = this.connectionRepo.create({
      requesterId,
      addresseeId: dto.addresseeId,
      tenantId,
    });
    return this.connectionRepo.save(connection);
  }

  async update(
    tenantId: string,
    connectionId: string,
    userId: string,
    dto: UpdateConnectionDto,
  ): Promise<UserConnection> {
    const connection = await this.connectionRepo.findOne({
      where: { id: connectionId, tenantId },
    });
    if (!connection) throw new NotFoundException('Connection not found');

    // Only the addressee can accept/block
    if (connection.addresseeId !== userId) {
      throw new ForbiddenException('Only the addressee can update the status');
    }

    connection.status = dto.status;
    return this.connectionRepo.save(connection);
  }

  async findAll(tenantId: string, userId: string): Promise<UserConnection[]> {
    return this.connectionRepo.find({
      where: [
        { requesterId: userId, tenantId, status: ConnectionStatus.ACCEPTED },
        { addresseeId: userId, tenantId, status: ConnectionStatus.ACCEPTED },
      ],
      relations: ['requester', 'addressee'],
    });
  }

  async findPending(
    tenantId: string,
    userId: string,
  ): Promise<UserConnection[]> {
    return this.connectionRepo.find({
      where: {
        addresseeId: userId,
        tenantId,
        status: ConnectionStatus.PENDING,
      },
      relations: ['requester'],
    });
  }
}
