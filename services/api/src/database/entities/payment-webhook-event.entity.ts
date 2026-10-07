import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

/**
 * Idempotency ledger for NearPay webhooks.
 * Stores ONLY safe fields — never PAN (even masked).
 */
@Entity('payment_webhook_events')
export class PaymentWebhookEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  providerEventKey!: string;

  @Column({ type: 'varchar', length: 32, default: 'nearpay' })
  provider!: string;

  @Column({ type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  transactionId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  customerReferenceNumber!: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  status!: string | null;

  @Column({ type: 'int', nullable: true })
  amountMinor!: number | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  currency!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  merchantId!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  terminalId!: string | null;

  @Column({ type: 'boolean', default: false })
  processed!: boolean;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
