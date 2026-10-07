import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

/**
 * Single-use owner login or password-reset code. Only the hash is stored.
 */
@Entity('login_codes')
@Index('login_codes_email_created', ['email', 'createdAt'])
export class LoginCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: UUID_COL })
  userId!: string;

  @Index()
  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'varchar', length: 32 })
  purpose!: 'owner_setup' | 'password_reset';

  @Column({ type: 'varchar', length: 128 })
  codeHash!: string;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
