import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

@Entity('audit_logs')
export class AuditLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  action!: string;

  @Column({ type: UUID_COL, nullable: true })
  actorUserId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  actorType!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  resourceType!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  resourceId!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'varchar', length: 16, default: 'success' })
  result!: 'success' | 'failure' | 'pending';

  @Column({ type: 'varchar', length: 320, nullable: true })
  actorEmail!: string | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
