import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Skill } from './entities/skill.entity.js';
import { UserSkill } from './entities/user-skill.entity.js';
import { CreateSkillDto } from './dto/create-skill.dto.js';

@Injectable()
export class SkillsService {
  constructor(
    @InjectRepository(Skill)
    private readonly skillRepo: Repository<Skill>,
    @InjectRepository(UserSkill)
    private readonly userSkillRepo: Repository<UserSkill>,
  ) {}

  async create(tenantId: string, dto: CreateSkillDto): Promise<Skill> {
    const existing = await this.skillRepo.findOne({
      where: { name: dto.name, tenantId },
    });
    if (existing) throw new ConflictException('Skill already exists');

    const skill = this.skillRepo.create({ ...dto, tenantId });
    return this.skillRepo.save(skill);
  }

  async findAll(tenantId: string): Promise<Skill[]> {
    return this.skillRepo.find({ where: { tenantId } });
  }

  async addSkillToUser(
    tenantId: string,
    userId: string,
    skillId: string,
  ): Promise<UserSkill> {
    const skill = await this.skillRepo.findOne({
      where: { id: skillId, tenantId },
    });
    if (!skill) throw new NotFoundException('Skill not found');

    const existing = await this.userSkillRepo.findOne({
      where: { userId, skillId, tenantId },
    });
    if (existing) throw new ConflictException('Skill already assigned');

    const userSkill = this.userSkillRepo.create({ userId, skillId, tenantId });
    return this.userSkillRepo.save(userSkill);
  }

  async removeSkillFromUser(
    tenantId: string,
    userId: string,
    skillId: string,
  ): Promise<void> {
    const result = await this.userSkillRepo.delete({
      userId,
      skillId,
      tenantId,
    });
    if (result.affected === 0) {
      throw new NotFoundException('User skill not found');
    }
  }

  async findUserSkills(tenantId: string, userId: string): Promise<Skill[]> {
    const userSkills = await this.userSkillRepo.find({
      where: { userId, tenantId },
      relations: ['skill'],
    });
    return userSkills.map((us) => us.skill);
  }
}
