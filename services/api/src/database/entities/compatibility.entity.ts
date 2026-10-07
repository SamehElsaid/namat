import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

@Entity('compatibility_rules')
export class CompatibilityRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'varchar', length: 64 })
  minIosVersion!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  maxIosVersion!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  supportedModels!: string[] | null;

  @Column({ type: 'boolean', default: true })
  isSupported!: boolean;

  @Column({ type: 'varchar', length: 32, default: 'SUPPORTED' })
  state!: 'SUPPORTED' | 'TESTING' | 'UNSUPPORTED' | 'BLOCKED';

  @Column({ type: 'varchar', length: 64, nullable: true })
  minAppVersion!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  lastVerifiedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}

@Entity('app_versions')
export class AppVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  version!: string;

  @Column({ type: 'boolean', default: false })
  isMandatory!: boolean;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 512, nullable: true })
  downloadUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  releaseNotes!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  checksum!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  ipaPath!: string | null;

  /** True only after a cryptographic signature check, never a filename check. */
  @Column({ type: 'boolean', default: false })
  signatureVerified!: boolean;

  @Column({ type: 'varchar', length: 64, default: 'unverified' })
  signatureStatus!: string;

  /** SHA-256 of the exact IPA bytes that passed verification. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  signatureSha256!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  signatureExpiresAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  signatureBundleId!: string | null;

  @Column({ type: 'boolean', default: false })
  published!: boolean;

  @Column({ type: DATE_COL, nullable: true })
  publishedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
