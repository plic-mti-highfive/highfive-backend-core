import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { Project } from '../../projects/entities/project.entity.js';
import { User } from '../../../identity/users/entities/user.entity.js';

@Entity('project_messages')
export class ProjectMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({ name: 'author_id' })
  authorId: string;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'varchar', name: 'attachment_path', nullable: true })
  attachmentPath: string | null;

  @Column({ type: 'uuid', name: 'reply_to_id', nullable: true })
  replyToId: string | null;

  @ManyToOne(() => Project)
  @JoinColumn({ name: 'project_id' })
  project: Project;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @ManyToOne(() => ProjectMessage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'reply_to_id' })
  replyTo: ProjectMessage | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
