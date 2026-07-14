import { Entity, PrimaryColumn, Column, OneToOne, JoinColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

@Entity('user_profiles')
export class UserProfile {
  @PrimaryColumn({ name: 'user_id' })
  userId: string;

  @OneToOne(() => User, (user) => user.profile)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'tenant_id' })
  tenantId: string;

  @Column({ type: 'varchar', name: 'display_name', nullable: true })
  displayName: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', name: 'avatar_path', nullable: true })
  avatarPath: string | null;

  @Column({ name: 'theme_preference', default: 'light' })
  themePreference: string;

  @Column({ name: 'email_notifications', default: true })
  emailNotifications: boolean;
}
