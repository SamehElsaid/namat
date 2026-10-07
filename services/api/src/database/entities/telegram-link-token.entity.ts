import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';

/**
 * Short-lived, single-use token that links a Telegram chat to a NAMAT account.
 * Only the SHA-256 hash of the token is stored — the raw token lives only in
 * the deep link handed to the user. No account identifier is embedded in the
 * token itself, so it reveals nothing if intercepted.
 */
@Entity('telegram_link_tokens')
export class TelegramLinkTokenEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @Column({ type: DATE_COL })
  expiresAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  consumedAt!: Date | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
