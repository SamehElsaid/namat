import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';
import { SessionEntity } from './session.entity';
import { DeviceEntity } from './device.entity';
import { PurchaseEntity } from './purchase.entity';
import { EntitlementEntity } from './entitlement.entity';
import { AiGenerationEntity } from './ai-generation.entity';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 32, default: 'user' })
  role!: 'user' | 'admin' | 'owner';

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  /** bcrypt hash. Null until the owner or admin finishes password setup. */
  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  passwordSetAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  passwordFailedAttempts!: number;

  @Column({ type: DATE_COL, nullable: true })
  passwordLockedUntil!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;

  @OneToMany(() => SessionEntity, (s) => s.user)
  sessions?: SessionEntity[];

  @OneToMany(() => DeviceEntity, (d) => d.user)
  devices?: DeviceEntity[];

  @OneToMany(() => PurchaseEntity, (p) => p.user)
  purchases?: PurchaseEntity[];

  @OneToMany(() => EntitlementEntity, (e) => e.user)
  entitlements?: EntitlementEntity[];

  @OneToMany(() => AiGenerationEntity, (g) => g.user)
  aiGenerations?: AiGenerationEntity[];
}
