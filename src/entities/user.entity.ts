import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AccountStatus, PlatformRole } from '../contracts/index.js';
import { TagEntity } from './tag.entity.js';

/**
 * Personne (doc 04 §2). `username` est l'identifiant public et la route
 * (`/u/:username`) ; `email`, `accountStatus` et `platformRole` ne sortent que
 * sur `CurrentUser`.
 *
 * R-P2 : la suppression d'un compte passe par `deletedAt` + anonymisation
 * (`username` remplace, `email`/`passwordHash` vides), jamais par un DELETE.
 */
@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 24 })
  username!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 40, nullable: true })
  displayName!: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ name: 'avatar_url', type: 'text' })
  avatarUrl!: string;

  @Column({ type: 'varchar', length: 280, nullable: true })
  bio!: string | null;

  @Column({
    name: 'account_status',
    type: 'varchar',
    length: 16,
    default: 'active',
  })
  accountStatus!: AccountStatus;

  @Column({
    name: 'platform_role',
    type: 'varchar',
    length: 16,
    default: 'member',
  })
  platformRole!: PlatformRole;

  @Column({ name: 'password_hash', type: 'text' })
  passwordHash!: string;

  /**
   * 0 a 10 themes. Table de jointure plutot qu'un tableau : integrite
   * referentielle vers `tags` et index utilisable par la recommandation.
   */
  @ManyToMany(() => TagEntity, { eager: true })
  @JoinTable({
    name: 'user_interests',
    joinColumn: { name: 'user_id' },
    inverseJoinColumn: { name: 'tag_id' },
  })
  interests!: TagEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({
    name: 'last_visit_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  lastVisitAt!: Date;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
