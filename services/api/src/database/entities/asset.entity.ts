import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { DATE_COL } from '../column-types';

@Entity('assets')
export class AssetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128 })
  key!: string;

  @Column({ type: 'varchar', length: 512 })
  path!: string;

  @Column({ type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ type: 'int', default: 0 })
  byteSize!: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contentHash!: string | null;

  @Column({ type: 'varchar', length: 64, default: 'local' })
  storageBackend!: string;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;
}
