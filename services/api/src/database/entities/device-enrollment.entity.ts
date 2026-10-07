import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

export type EnrollmentStatus =
  | 'DISCOVERED'
  | 'REGISTERING'
  | 'REGISTERED'
  | 'INSTALL_READY'
  | 'EXPIRED'
  | 'FAILED';

export type EnrollmentSigningStatus =
  | 'QUEUED'
  | 'REGISTERING_DEVICE'
  | 'GENERATING_PROFILE'
  | 'SIGNING'
  | 'READY'
  | 'FAILED';

@Entity('device_enrollments')
export class DeviceEnrollmentEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  /** Encrypted one-time token so a refresh can re-issue the profile URL. Cleared after use. */
  @Column({ type: 'text', nullable: true })
  tokenCipher!: string | null;

  /** Encrypted one-time Profile Service challenge. Never log or return it. */
  @Column({ type: 'text', nullable: true })
  challengeCipher!: string | null;

  /** Signer metadata from diagnostic mode. Never contains the device identifier or plist. */
  @Column({ type: 'text', nullable: true })
  cmsDiagnostic!: string | null;

  @Column({ type: 'varchar', length: 32 })
  status!: EnrollmentStatus;

  @Column({ type: 'varchar', length: 32, nullable: true })
  signingStatus!: EnrollmentSigningStatus | null;

  @Column({ type: 'varchar', length: 32 })
  installStrategy!: string;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  consumedAt!: Date | null;

  @Column({ type: DATE_COL, nullable: true })
  deactivatedAt!: Date | null;

  /** AES-GCM ciphertext. Never selected into customer or admin responses. */
  @Column({ type: 'text', nullable: true })
  udidCipher!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  udidFingerprint!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  product!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  iosVersion!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  appleDeviceId!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  appleState!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  profileId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  failureCode!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  label!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  namatInstallationId!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  activatedAt!: Date | null;

  @Index('idx_device_enrollments_manifest_token')
  @Column({ type: 'varchar', length: 64, nullable: true })
  manifestTokenHash!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  manifestExpiresAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
