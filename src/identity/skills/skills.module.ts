import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './entities/skill.entity.js';
import { UserSkill } from './entities/user-skill.entity.js';
import { SkillsService } from './skills.service.js';
import { SkillsController } from './skills.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([Skill, UserSkill])],
  controllers: [SkillsController],
  providers: [SkillsService],
  exports: [SkillsService],
})
export class SkillsModule {}
