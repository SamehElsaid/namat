import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';
import { UserEntity } from './user.entity';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.sessions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  tokenHash!: string;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  revokedAt!: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipHash!: string | null;

  /**
   * customer: website and existing sessions.
   * password_setup: may only set a password.
   * staff: owner dashboard after password login.
   * Null is treated as customer so older sessions cannot open the dashboard.
   */
  @Column({ type: 'varchar', length: 32, nullable: true })
  purpose!: 'customer' | 'staff' | 'password_setup' | null;

  @Column({ type: UUID_COL, nullable: true })
  loginCodeId!: string | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
