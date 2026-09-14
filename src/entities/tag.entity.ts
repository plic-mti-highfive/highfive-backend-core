import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { TagAccent, TagFamily } from '../contracts/index.js';

/**
 * Theme (R-T1/R-T2) : liste fermee de 24 lignes semees au demarrage, jamais
 * creee depuis l'interface. La suppression n'existe pas : `active = false`.
 * L'identifiant est le slug public (`jeu-video`), pas un uuid.
 */
@Entity('tags')
export class TagEntity {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id!: string;

  @Column({ type: 'varchar', length: 20 })
  label!: string;

  @Column({ type: 'varchar', length: 16 })
  family!: TagFamily;

  @Column({ type: 'varchar', length: 16 })
  accent!: TagAccent;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
