import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Ticket } from './ticket.entity.js';

@Entity('ticket_checklist_items')
export class ChecklistItem {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'ticket_id' })
  ticketId!: string;

  @Column({ name: 'tenant_id' })
  tenantId!: string;

  @ManyToOne(() => Ticket, (ticket) => ticket.checklistItems, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket;

  @Column()
  content!: string;

  @Column({ name: 'is_completed', default: false })
  isCompleted!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
