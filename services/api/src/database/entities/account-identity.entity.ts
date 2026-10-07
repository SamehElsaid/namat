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

/**
 * External login identity. `providerSubject` is the provider's stable subject
 * (Google `sub`). Tokens are not stored.
 */
@Entity('account_identities')
@Index('account_identities_provider_subject', ['provider', 'providerSubject'], {
  unique: true,
})
@Index('account_identities_user_provider', ['userId', 'provider'], {
  unique: true,
})
export class AccountIdentityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'varchar', length: 32 })
  provider!: 'google';

  @Column({ type: 'varchar', length: 255 })
  providerSubject!: string;

  @Column({ type: 'varchar', length: 320 })
  email!: string;

  @Column({ type: 'boolean', default: false })
  emailVerified!: boolean;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
