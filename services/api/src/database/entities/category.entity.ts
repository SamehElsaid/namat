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
import { SkinEntity } from './skin.entity';

@Entity('categories')
export class CategoryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  slug!: string;

  @Column({ type: 'varchar', length: 128 })
  name!: string;

  @Column({ type: 'varchar', length: 128, nullable: true })
  nameAr!: string | null;

  @Column({ type: 'int', default: 0 })
  sortOrder!: number;

  @Column({ type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ type: DATE_COL })
  createdAt!: Date;

  @UpdateDateColumn({ type: DATE_COL })
  updatedAt!: Date;

  @OneToMany(() => SkinEntity, (s) => s.category)
  skins?: SkinEntity[];
}
