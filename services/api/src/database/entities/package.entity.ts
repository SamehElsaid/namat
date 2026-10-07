import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

/**
 * A purchasable NAMAT package (product). The price is owner-editable; the
 * checkout and the payment amount check both read it from here, so a published
 * package's price is the single source of truth for what a customer pays.
 */
@Entity('packages')
export class PackageEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 128 })
  nameEn!: string;

  @Column({ type: 'varchar', length: 128 })
  nameAr!: string;

  /** Price in minor units (halalas for SAR). */
  @Column({ type: 'int' })
  priceMinor!: number;

  @Column({ type: 'varchar', length: 8, default: 'SAR' })
  currency!: string;

  @Column({ type: 'int', default: 1 })
  maxDevices!: number;

  /** Access duration in days; null means lifetime (no expiry). */
  @Column({ type: 'int', nullable: true })
  durationDays!: number | null;

  @Column({ type: 'boolean', default: false })
  isPublished!: boolean;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
