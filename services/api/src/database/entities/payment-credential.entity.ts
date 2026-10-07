import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

/**
 * AES-256-GCM ciphertext for owner-replaced Moyasar credentials.
 * The encryption key is PAYMENT_CONFIG_KEY and never lives in this table.
 */
@Entity('payment_credentials')
export class PaymentCredentialEntity {
  @PrimaryColumn({ type: 'varchar', length: 16, default: 'default' })
  id!: string;

  @Column({ type: 'text', nullable: true })
  secretKeyCipher!: string | null;

  @Column({ type: 'text', nullable: true })
  publishableKeyCipher!: string | null;

  @Column({ type: 'text', nullable: true })
  webhookSecretCipher!: string | null;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
