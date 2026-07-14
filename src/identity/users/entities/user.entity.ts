import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
  OneToOne,
} from 'typeorm';
import { UserStatus } from '@plic-mti-highfive/shared-types';
import { SystemRole } from '../../../shared/auth/system-role.enum.js';
import { Tenant } from '../../tenants/entities/tenant.entity.js';
import { UserProfile } from '../../user-profiles/entities/user-profile.entity.js';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Tenant)
  @JoinColumn({ name: 'tenant_id' })
  tenant!: Tenant;

  @Column({ unique: true })
  email!: string;

  @Column({ name: 'password_hash' })
  @Exclude()
  passwordHash!: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;

  @Column({
    name: 'system_role',
    type: 'enum',
    enum: SystemRole,
    default: SystemRole.USER,
  })
  systemRole!: SystemRole;

  @OneToOne(() => UserProfile, (profile) => profile.user, { cascade: true })
  profile!: UserProfile;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt!: Date | null;
}
