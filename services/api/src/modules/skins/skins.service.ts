import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { SkinEntity } from '../../database/entities/skin.entity';
import { SkinVersionEntity } from '../../database/entities/skin-version.entity';
import { CategoryEntity } from '../../database/entities/category.entity';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { SkinManifestEntry } from '@namat/shared';
import { AuditService } from '../audit/audit.service';
import {
  ARTWORK_2X,
  ARTWORK_3X,
  ARTWORK_THUMB,
  prepareArtwork,
} from './artwork-pipeline';

@Injectable()
export class SkinsService {
  constructor(
    @InjectRepository(SkinEntity)
    private readonly skins: Repository<SkinEntity>,
    @InjectRepository(SkinVersionEntity)
    private readonly versions: Repository<SkinVersionEntity>,
    @InjectRepository(CategoryEntity)
    private readonly categories: Repository<CategoryEntity>,
    private readonly storage: LocalFileStorage,
    private readonly audit: AuditService,
  ) {}

  async listPublishedManifest(): Promise<SkinManifestEntry[]> {
    const rows = await this.skins.find({
      where: { status: 'published' },
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
    return rows.map((s) => this.toManifest(s));
  }

  async getById(id: string): Promise<SkinEntity> {
    const s = await this.skins.findOne({ where: { id } });
    if (!s) throw new NotFoundException('Skin not found');
    return s;
  }

  /** Public lookup. Drafts and archived skins are not visible outside admin. */
  async getPublishedById(id: string): Promise<SkinEntity> {
    const s = await this.skins.findOne({ where: { id, status: 'published' } });
    if (!s) throw new NotFoundException('Skin not found');
    return s;
  }

  async listAll(): Promise<SkinEntity[]> {
    return this.skins.find({ order: { sortOrder: 'ASC', updatedAt: 'DESC' } });
  }

  async create(input: {
    slug: string;
    name: string;
    nameAr?: string;
    description?: string;
    categoryId?: string;
    artworkPath?: string;
    thumbnailPath?: string;
    contentHash?: string;
  }): Promise<SkinEntity> {
    const skin = await this.skins.save(
      this.skins.create({
        slug: input.slug,
        name: input.name,
        nameAr: input.nameAr ?? null,
        description: input.description ?? null,
        categoryId: input.categoryId ?? null,
        status: 'draft',
        currentVersion: 1,
        contentHash: input.contentHash ?? null,
        artworkPath: input.artworkPath ?? null,
        thumbnailPath: input.thumbnailPath ?? null,
      }),
    );
    if (input.artworkPath && input.contentHash) {
      await this.versions.save(
        this.versions.create({
          skinId: skin.id,
          version: 1,
          contentHash: input.contentHash,
          artworkPath: input.artworkPath,
          thumbnailPath: input.thumbnailPath ?? null,
          metadata: null,
        }),
      );
    }
    return skin;
  }

  async update(
    id: string,
    patch: Partial<
      Pick<
        SkinEntity,
        | 'name'
        | 'nameAr'
        | 'description'
        | 'categoryId'
        | 'sortOrder'
        | 'artworkPath'
        | 'thumbnailPath'
        | 'contentHash'
      >
    >,
  ): Promise<SkinEntity> {
    const skin = await this.getById(id);
    Object.assign(skin, patch);
    return this.skins.save(skin);
  }

  async publish(id: string, actorUserId: string | null): Promise<SkinEntity> {
    const skin = await this.getById(id);
    if (!skin.artworkPath || !skin.contentHash) {
      throw new BadRequestException('Skin missing artwork/hash');
    }
    const ok = await this.storage.exists(skin.artworkPath);
    if (!ok) {
      throw new BadRequestException('Published artwork file is missing');
    }
    skin.status = 'published';
    skin.publishedAt = new Date();
    const saved = await this.skins.save(skin);
    await this.audit.record({
      action: 'skin.publish',
      actorUserId,
      actorType: 'admin',
      resourceType: 'skin',
      resourceId: saved.id,
    });
    return saved;
  }

  async archive(id: string): Promise<SkinEntity> {
    const skin = await this.getById(id);
    skin.status = 'archived';
    return this.skins.save(skin);
  }

  async unpublish(id: string, actorUserId: string | null): Promise<SkinEntity> {
    const skin = await this.getById(id);
    skin.status = 'draft';
    skin.publishedAt = null;
    const saved = await this.skins.save(skin);
    await this.audit.record({
      action: 'skin.unpublish',
      actorUserId,
      actorType: 'admin',
      resourceType: 'skin',
      resourceId: saved.id,
    });
    return saved;
  }

  /** Storefront: active categories only. */
  async listCategories(): Promise<CategoryEntity[]> {
    return this.categories.find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Admin: every category, including deactivated, for management. */
  async listAllCategories(): Promise<CategoryEntity[]> {
    return this.categories.find({
      order: { sortOrder: 'ASC', name: 'ASC' },
    });
  }

  async createCategory(input: {
    slug: string;
    name: string;
    nameAr?: string;
    sortOrder?: number;
  }): Promise<CategoryEntity> {
    return this.categories.save(
      this.categories.create({
        slug: input.slug,
        name: input.name,
        nameAr: input.nameAr ?? null,
        sortOrder: input.sortOrder ?? 0,
        isActive: true,
      }),
    );
  }

  async updateCategory(
    id: string,
    patch: Partial<Pick<CategoryEntity, 'name' | 'nameAr' | 'slug' | 'sortOrder' | 'isActive'>>,
  ): Promise<CategoryEntity> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    if (patch.name !== undefined) category.name = patch.name;
    if (patch.nameAr !== undefined) category.nameAr = patch.nameAr;
    if (patch.slug !== undefined) category.slug = patch.slug;
    if (patch.sortOrder !== undefined) category.sortOrder = patch.sortOrder;
    if (patch.isActive !== undefined) category.isActive = patch.isActive;
    return this.categories.save(category);
  }

  /**
   * Removes a category only when no skin references it. A referenced category
   * is kept so published artwork never loses its grouping; deactivate instead.
   */
  async deleteCategory(id: string): Promise<{ ok: true }> {
    const category = await this.categories.findOne({ where: { id } });
    if (!category) throw new NotFoundException('Category not found');
    const used = await this.skins.count({ where: { categoryId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Category is used by ${used} design(s). Reassign or deactivate it instead.`,
      );
    }
    await this.categories.remove(category);
    return { ok: true };
  }

  toPublic(skin: SkinEntity) {
    return {
      id: skin.id,
      slug: skin.slug,
      name: skin.name,
      nameAr: skin.nameAr,
      description: skin.description,
      categoryId: skin.categoryId,
      status: skin.status,
      version: skin.currentVersion,
      contentHash: skin.contentHash,
      thumbnailUrl: skin.thumbnailPath
        ? this.storage.publicUrl(skin.thumbnailPath)
        : null,
      artworkUrl: skin.artworkPath
        ? this.storage.publicUrl(skin.artworkPath)
        : null,
      updatedAt: skin.updatedAt.toISOString(),
    };
  }

  private toManifest(skin: SkinEntity): SkinManifestEntry {
    return {
      id: skin.id,
      slug: skin.slug,
      name: skin.name,
      categoryId: skin.categoryId,
      version: skin.currentVersion,
      contentHash: skin.contentHash ?? '',
      thumbnailUrl: skin.thumbnailPath
        ? this.storage.publicUrl(skin.thumbnailPath)
        : '',
      artworkUrl: skin.artworkPath
        ? this.storage.publicUrl(skin.artworkPath)
        : '',
      updatedAt: skin.updatedAt.toISOString(),
    };
  }

  async listVersions(skinId: string): Promise<SkinVersionEntity[]> {
    await this.getById(skinId);
    return this.versions.find({
      where: { skinId },
      order: { version: 'DESC' },
    });
  }

  async uploadArtwork(input: {
    skinId: string;
    bytes: Buffer;
    mimeType: string;
    actorUserId: string | null;
  }): Promise<SkinEntity> {
    const skin = await this.getById(input.skinId);
    const prepared = prepareArtwork(input.bytes, input.mimeType);
    const nextVersion = skin.currentVersion + (skin.artworkPath ? 1 : 0);
    const base = `skins/${skin.id}/v${nextVersion}`;
    const x3Path = `${base}/${ARTWORK_3X.filename}`;
    const x2Path = `${base}/${ARTWORK_2X.filename}`;
    const thumbPath = `${base}/${ARTWORK_THUMB.filename}`;
    await this.storage.writeBuffer(x3Path, prepared.x3, 'image/png');
    await this.storage.writeBuffer(x2Path, prepared.x2, 'image/png');
    await this.storage.writeBuffer(thumbPath, prepared.thumbnail, 'image/png');
    const verified = await this.storage.readBuffer(x3Path);
    if (SkinsService.hashBuffer(verified) !== prepared.contentHash) {
      throw new BadRequestException('Artwork verification failed');
    }
    await this.versions.save(
      this.versions.create({
        skinId: skin.id,
        version: nextVersion,
        contentHash: prepared.contentHash,
        artworkPath: x3Path,
        thumbnailPath: thumbPath,
        metadata: {
          x2Path,
          x3Path,
          sourceWidth: prepared.width,
          sourceHeight: prepared.height,
          sourceMime: prepared.sourceMime,
        },
      }),
    );
    skin.currentVersion = nextVersion;
    skin.contentHash = prepared.contentHash;
    skin.artworkPath = x3Path;
    skin.thumbnailPath = thumbPath;
    const saved = await this.skins.save(skin);
    await this.audit.record({
      action: 'skin.artwork_upload',
      actorUserId: input.actorUserId,
      actorType: 'admin',
      resourceType: 'skin',
      resourceId: saved.id,
      metadata: { version: nextVersion, contentHash: prepared.contentHash },
    });
    return saved;
  }

  async rollbackToVersion(
    skinId: string,
    version: number,
    actorUserId: string | null,
  ): Promise<SkinEntity> {
    const skin = await this.getById(skinId);
    const prior = await this.versions.findOne({
      where: { skinId, version },
    });
    if (!prior) throw new NotFoundException('Skin version not found');
    if (!(await this.storage.exists(prior.artworkPath))) {
      throw new BadRequestException('Historical artwork file is missing');
    }
    const nextVersion = skin.currentVersion + 1;
    await this.versions.save(
      this.versions.create({
        skinId: skin.id,
        version: nextVersion,
        contentHash: prior.contentHash,
        artworkPath: prior.artworkPath,
        thumbnailPath: prior.thumbnailPath,
        metadata: {
          ...(prior.metadata ?? {}),
          rolledBackFromVersion: version,
        },
      }),
    );
    skin.currentVersion = nextVersion;
    skin.contentHash = prior.contentHash;
    skin.artworkPath = prior.artworkPath;
    skin.thumbnailPath = prior.thumbnailPath;
    const saved = await this.skins.save(skin);
    await this.audit.record({
      action: 'skin.rollback',
      actorUserId,
      actorType: 'admin',
      resourceType: 'skin',
      resourceId: saved.id,
      metadata: { fromVersion: version, currentVersion: nextVersion },
    });
    return saved;
  }

  static hashBuffer(buf: Buffer): string {
    return createHash('sha256').update(buf).digest('hex');
  }
}
