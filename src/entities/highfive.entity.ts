import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 * Highfive (doc 04 §8). La cle primaire composite realise a elle seule R-H1 :
 * au plus un par personne et par projet, ce qui rend donner/retirer
 * idempotents sans logique supplementaire.
 */
@Entity('highfives')
export class HighfiveEntity {
  @PrimaryColumn({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Index()
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'given_at', type: 'timestamptz', default: () => 'now()' })
  givenAt!: Date;
}
