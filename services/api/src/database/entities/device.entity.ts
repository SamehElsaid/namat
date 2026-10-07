import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';
import { UserEntity } from './user.entity';

@Entity('devices')
export class DeviceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.devices, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  /** NAMAT installation ID — never an Apple Pass / Wallet card id. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  installationId!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  appVersion!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  iosVersion!: string | null;

  /** Friendly label. Never use installationId as the primary display name. */
  @Column({ type: 'varchar', length: 128, nullable: true })
  label!: string | null;

  /**
   * SHA-256 of the NAMAT installation token generated on device.
   * This is the app activation secret. It is not an Apple UDID.
   */
  @Column({ type: 'varchar', length: 128, nullable: true })
  installationTokenHash!: string | null;

  /**
   * Uncompressed P-256 point, base64, 65 bytes starting with 0x04.
   * The private key stays in the iPhone Keychain and is not synchronizable.
   */
  @Column({ type: 'varchar', length: 180, nullable: true })
  publicKeyPoint!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  publicKeyFingerprint!: string | null;

  /** Base64 App Attest key id (SHA-256 of the attested public key), once verified. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  appAttestKeyId!: string | null;

  /** production | development — the attestation environment Apple reported. */
  @Column({ type: 'varchar', length: 16, nullable: true })
  appAttestEnv!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  attestedAt!: Date | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: 'active' | 'inactive';

  @Column({ type: DATE_COL, nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: DATE_COL, nullable: true })
  deactivatedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
