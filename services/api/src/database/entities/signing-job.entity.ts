import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

@Entity('signing_jobs')
export class SigningJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  enrollmentId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  /** RESIGN reuses the stable Release payload. FULL_REBUILD compiles from source. */
  @Column({ type: 'varchar', length: 32 })
  mode!: 'RESIGN' | 'FULL_REBUILD';

  @Column({ type: 'int', default: 1 })
  attempt!: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipaSha256!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  profileIdentifier!: string | null;

  /** Encrypted provisioning profile. Contains device identifiers; never log or return to customers. */
  @Column({ type: 'text', nullable: true })
  profileCipher!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  appVersion!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  buildNumber!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  sourceCommit!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  airliftSha!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  artifactRelativePath!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  signingTimestamp!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}

@Entity('signing_locks')
export class SigningLockEntity {
  @PrimaryColumn({ type: 'varchar', length: 32 })
  id!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ownerJobId!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  lockedUntil!: Date | null;
}
