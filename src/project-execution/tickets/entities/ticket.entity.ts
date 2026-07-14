import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { TicketStatus } from '@plic-mti-highfive/shared-types';
import { Project } from '../../projects/entities/project.entity.js';
import { User } from '../../../identity/users/entities/user.entity.js';
import { TicketComment } from './ticket-comment.entity.js';
import { ChecklistItem } from './checklist-item.entity.js';

@Entity('tickets')
export class Ticket {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id' })
  projectId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column()
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: TicketStatus,
    default: TicketStatus.TODO,
  })
  status!: TicketStatus;

  @Column({ name: 'assignee_id', nullable: true })
  assigneeId!: string | null;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project!: Project;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assignee_id' })
  assignee!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => ChecklistItem, (item) => item.ticket, { cascade: true })
  checklistItems!: ChecklistItem[];

  @OneToMany(() => TicketComment, (comment) => comment.ticket, {
    cascade: true,
  })
  comments!: TicketComment[];
}
