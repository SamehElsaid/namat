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
import { PurchaseEntity } from './purchase.entity';

@Entity('entitlements')
export class EntitlementEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.entitlements, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Index()
  @Column({ type: UUID_COL, nullable: true })
  purchaseId!: string | null;

  @ManyToOne(() => PurchaseEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'purchaseId' })
  purchase!: PurchaseEntity | null;

  @Column({ type: 'varchar', length: 32, default: 'active' })
  status!: 'active' | 'revoked';

  @Column({ type: 'varchar', length: 64, default: 'lifetime' })
  plan!: string;

  @Column({ type: 'int', default: 1 })
  maxDevices!: number;

  @Column({ type: DATE_COL, nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  revokeReason!: string | null;

  /** purchase, manual, or owner_test. Null legacy rows follow purchaseId. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  grantSource!: 'purchase' | 'manual' | 'owner_test' | null;

  /** The package code this entitlement was granted for. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  packageCode!: string | null;

  /** Access expiry; null means lifetime (no expiry). */
  @Column({ type: DATE_COL, nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
