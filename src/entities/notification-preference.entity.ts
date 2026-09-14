import { Column, Entity, PrimaryColumn } from 'typeorm';
import type {
  NotificationChannel,
  NotificationType,
} from '../contracts/index.js';

/**
 * Preference de notification (R-N4). Aucune ligne n'est ecrite tant que la
 * personne n'a rien regle : l'absence de ligne vaut « defauts », calcules a la
 * lecture. Materialiser les defauts pour tout le monde couterait une ligne par
 * personne et par type pour zero information.
 */
@Entity('notification_preferences')
export class NotificationPreferenceEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @PrimaryColumn({ type: 'varchar', length: 48 })
  type!: NotificationType;

  @Column({ type: 'simple-array' })
  channels!: NotificationChannel[];
}
