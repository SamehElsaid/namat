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

@Entity('ai_generations')
export class AiGenerationEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: UUID_COL })
  userId!: string;

  @ManyToOne(() => UserEntity, (u) => u.aiGenerations, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user!: UserEntity;

  @Column({ type: 'text' })
  prompt!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  stylePresetId!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  referenceImageUrl!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'queued' })
  status!: 'queued' | 'processing' | 'completed' | 'failed' | 'moderated';

  @Column({ type: 'varchar', length: 512, nullable: true })
  resultAssetPath!: string | null;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;
}
