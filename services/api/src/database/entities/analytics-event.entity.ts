import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

@Entity('analytics_events')
export class AnalyticsEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  name!: string;

  @Column({ type: UUID_COL, nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  installationId!: string | null;

  /** Non-sensitive properties only — never Wallet secrets. */
  @Column({ type: 'simple-json', nullable: true })
  properties!: Record<string, unknown> | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
