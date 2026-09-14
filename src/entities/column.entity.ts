import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { TagAccent } from '../contracts/index.js';

/**
 * Colonne des Taches (doc 04 §11). R-K1 : trois colonnes creees avec le projet
 * (« A faire », « En cours », « Fait »). R-K2 : de 1 a 6 par projet.
 *
 * La position est stockee dans `position` : `order` est un mot reserve SQL, et
 * s'en remettre au quoting de l'ORM pour une colonne lue dans des requetes
 * ecrites a la main serait une source d'erreur inutile.
 */
@Entity('columns')
export class ColumnEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ type: 'varchar', length: 24 })
  label!: string;

  @Column({ name: 'position', type: 'int' })
  order!: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  color!: TagAccent | null;
}
