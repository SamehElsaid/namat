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

export type PurchaseStatusDb =
  | 'pending'
  | 'reserving'
  | 'approved'
  | 'test_paid'
  | 'rejected'
  | 'reversed'
  | 'refunded'
  | 'cancelled';

@Entity('purchases')
export class PurchaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.purchases, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 32, default: 'pending' })
  status!: PurchaseStatusDb;

  /** Amount in minor units (halalas for SAR). */
  @Column({ type: 'int' })
  amountMinor!: number;

  @Column({ type: 'varchar', length: 8, default: 'SAR' })
  currency!: string;

  @Column({ type: 'varchar', length: 32, default: 'nearpay' })
  provider!: string;

  /** Our reference sent to NearPay as customer_reference_number. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  customerReferenceNumber!: string;

  /** NearPay transaction UUID when known — never PAN. */
  @Index()
  @Column({ type: 'varchar', length: 128, nullable: true })
  nearpayTransactionId!: string | null;

  /** Job id NAMAT sent when initiating a remote terminal purchase. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  nearpayJobId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  nearpayMerchantId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  nearpayTerminalId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  retrievalReferenceNumber!: string | null;

  /** test or live for Moyasar. Null on historical NearPay rows. */
  @Column({ type: 'varchar', length: 8, nullable: true })
  providerMode!: 'test' | 'live' | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, nullable: true })
  moyasarInvoiceId!: string | null;

  @Index()
  @Column({ type: 'varchar', length: 64, nullable: true })
  moyasarPaymentId!: string | null;

  /** reserving | invoice_open | unknown. Not a customer-facing status. */
  @Column({ type: 'varchar', length: 32, nullable: true })
  providerState!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  paymentMethodType!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  paymentMethodBrand!: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  paymentMethodLast4!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  invoiceExpiresAt!: Date | null;

  /** The package this purchase is for. Its price is recorded in amountMinor. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  packageCode!: string | null;

  /** Devices granted by the purchased package, snapshotted at reserve time. */
  @Column({ type: 'int', nullable: true })
  packageMaxDevices!: number | null;

  /** Access duration in days from the package; null means lifetime. */
  @Column({ type: 'int', nullable: true })
  packageDurationDays!: number | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
