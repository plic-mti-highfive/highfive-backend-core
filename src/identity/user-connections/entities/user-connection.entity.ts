import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
} from 'typeorm';
import { ConnectionStatus } from '@plic-mti-highfive/shared-types';
import { User } from '../../users/entities/user.entity.js';

@Entity('user_connections')
export class UserConnection {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'requester_id' })
  requesterId!: string;

  @Column({ name: 'addressee_id' })
  addresseeId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @Column({
    type: 'enum',
    enum: ConnectionStatus,
    default: ConnectionStatus.PENDING,
  })
  status!: ConnectionStatus;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'requester_id' })
  requester!: User;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'addressee_id' })
  addressee!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
