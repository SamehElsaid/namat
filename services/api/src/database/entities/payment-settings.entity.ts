import {
  Column,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

/** Single-row owner payment policy. Secrets are not stored here. */
@Entity('payment_settings')
export class PaymentSettingsEntity {
  @PrimaryColumn({ type: 'varchar', length: 16, default: 'default' })
  id!: string;

  @Column({ type: 'boolean', default: false })
  checkoutEnabled!: boolean;

  @Column({ type: 'varchar', length: 8, default: 'test' })
  mode!: 'test' | 'live';

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
