import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

@Entity('otp_challenges')
export class OtpChallengeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
