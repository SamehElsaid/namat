import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { DATE_COL, UUID_COL } from '../column-types';
import { CategoryEntity } from './category.entity';
import { SkinVersionEntity } from './skin-version.entity';

@Entity('skins')
export class SkinEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  nameAr!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Index()
  @Column({ type: UUID_COL, nullable: true })
  categoryId!: string | null;

  @ManyToOne(() => CategoryEntity, (c) => c.skins, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'categoryId' })
  category!: CategoryEntity | null;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status!: 'draft' | 'published' | 'archived';

  @Column({ type: 'int', default: 1 })
  currentVersion!: number;

  @Column({ type: 'varchar', length: 128, nullable: true })
  contentHash!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  thumbnailPath!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  artworkPath!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;

  @Column({ type: DATE_COL, nullable: true })
  publishedAt!: Date | null;

  @OneToMany(() => SkinVersionEntity, (v) => v.skin)
  versions?: SkinVersionEntity[];
}
