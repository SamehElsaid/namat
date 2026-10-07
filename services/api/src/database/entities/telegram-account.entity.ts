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

/**
 * Links a Telegram user to a NAMAT account. Telegram is a companion channel,
 * never an identity source: a row here is created only after a single-use
 * linking token minted by an authenticated NAMAT session is redeemed.
 * At most one active row per NAMAT user and per Telegram user.
 */
@Entity('telegram_accounts')
export class TelegramAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  /** Telegram numeric user id, stored as text to avoid 64-bit precision loss. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  telegramUserId!: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  telegramChatId!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  telegramUsername!: string | null;

  @Column({ type: 'varchar', length: 128, nullable: true })
  telegramFirstName!: string | null;

  @Column({ type: 'varchar', length: 8, nullable: true })
  telegramLanguageCode!: string | null;

  @Column({ type: DATE_COL, nullable: true })
  linkedAt!: Date | null;

  @Column({ type: DATE_COL, nullable: true })
  lastSeenAt!: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
