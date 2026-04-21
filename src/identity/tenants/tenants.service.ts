import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Tenant } from './entities/tenant.entity.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async create(dto: CreateTenantDto): Promise<Tenant> {
    const existing = await this.tenantRepo.findOne({
      where: [{ name: dto.name }, { domain: dto.domain }],
    });
    if (existing) {
      throw new ConflictException('Tenant name or domain already exists');
    }
    const tenant = this.tenantRepo.create(dto);
    const saved = await this.tenantRepo.save(tenant);

    this.eventEmitter.emit('tenant.created', {
      tenantId: saved.id,
      name: saved.name,
      domain: saved.domain,
    });

    return saved;
  }

  async findAll(): Promise<Tenant[]> {
    return this.tenantRepo.find();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantRepo.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async findByIdOrFail(id: string): Promise<Tenant> {
    return this.findById(id);
  }
}
