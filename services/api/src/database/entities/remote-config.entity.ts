import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

@Entity('remote_config')
export class RemoteConfigEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64, default: 'default' })
  key!: string;

  /** Kill switch for Apply skin operation. */
  @Column({ type: 'boolean', default: false })
  killSwitchApply!: boolean;

  @Column({ type: 'boolean', default: false })
  killSwitchRestore!: boolean;

  @Column({ type: 'varchar', length: 64, default: '1.0.0' })
  minAppVersion!: string;

  @Column({ type: 'varchar', length: 64, default: '16.0' })
  minIosVersion!: string;

  @Column({ type: 'boolean', default: false })
  maintenanceMode!: boolean;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  extras!: Record<string, unknown> | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
