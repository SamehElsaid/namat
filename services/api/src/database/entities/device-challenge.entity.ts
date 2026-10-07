import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

/** Single-use apply challenge. The raw nonce is not stored. */
@Entity('device_challenges')
export class DeviceChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  deviceId!: string;

  @Column({ type: 'varchar', length: 64 })
  nonceHash!: string;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
