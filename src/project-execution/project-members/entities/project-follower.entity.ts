import {
  Entity,
  PrimaryColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity.js';
import { User } from '../../../identity/users/entities/user.entity.js';

@Entity('project_followers')
export class ProjectFollower {
  @PrimaryColumn({ name: 'project_id' })
  projectId!: string;

  @PrimaryColumn({ name: 'user_id' })
  userId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
