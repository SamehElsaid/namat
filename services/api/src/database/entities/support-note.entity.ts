import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

@Entity('support_notes')
export class SupportNoteEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @Index()
  @Column({ type: UUID_COL, nullable: true })
  purchaseId!: string | null;

  @Column({ type: UUID_COL, nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  /** Who opened the thread: the customer or a staff member. */
  @Column({ type: 'varchar', length: 16, default: 'staff' })
  source!: 'customer' | 'staff';

  @Column({ type: 'varchar', length: 200, nullable: true })
  subject!: string | null;

  @Column({ type: 'text' })
  body!: string;

  @Column({ type: 'varchar', length: 16, default: 'open' })
  status!: 'open' | 'resolved';

  @Column({ type: 'varchar', length: 255, nullable: true })
  outcome!: string | null;

  /** Staff reply shown back to the customer in their account. */
  @Column({ type: 'text', nullable: true })
  reply!: string | null;

  @Column({ type: 'varchar', length: 320, nullable: true })
  repliedByEmail!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  repliedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
