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
import { SkinEntity } from './skin.entity';

@Entity('skin_versions')
@Index(['skinId', 'version'], { unique: true })
export class SkinVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: UUID_COL })
  skinId!: string;

  @ManyToOne(() => SkinEntity, (s) => s.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skinId' })
  skin!: SkinEntity;

  @Column({ type: 'int' })
  version!: number;

  @Column({ type: 'varchar', length: 128 })
  contentHash!: string;

  @Column({ type: 'varchar', length: 512 })
  artworkPath!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailPath!: string | null;

  @Column({ type: 'simple-json', nullable: true })
  metadata!: Record<string, unknown> | null;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
