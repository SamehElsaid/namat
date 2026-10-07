import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PackageEntity } from '../../database/entities/package.entity';
import { AuditService } from '../audit/audit.service';

export interface CreatePackageInput {
  code: string;
  nameEn: string;
  nameAr: string;
  priceMinor: number;
  currency?: string;
  maxDevices?: number;
  durationDays?: number | null;
  sortOrder?: number;
}

export type UpdatePackageInput = Partial<
  Pick<
    PackageEntity,
    | 'nameEn'
    | 'nameAr'
    | 'priceMinor'
    | 'currency'
    | 'maxDevices'
    | 'durationDays'
    | 'sortOrder'
    | 'isPublished'
  >
>;

@Injectable()
export class PackagesService {
  constructor(
    @InjectRepository(PackageEntity)
    private readonly packages: Repository<PackageEntity>,
    private readonly audit: AuditService,
  ) {}

  /** Storefront/app: published packages only. */
  async listPublished(): Promise<PackageEntity[]> {
    return this.packages.find({
      where: { isPublished: true },
      order: { sortOrder: 'ASC', priceMinor: 'ASC' },
    });
  }

  /** Owner: every package including drafts. */
  async listAll(): Promise<PackageEntity[]> {
    return this.packages.find({ order: { sortOrder: 'ASC', priceMinor: 'ASC' } });
  }

  async requirePublishedByCode(code: string): Promise<PackageEntity> {
    const pkg = await this.packages.findOne({ where: { code, isPublished: true } });
    if (!pkg) throw new NotFoundException('package_not_available');
    return pkg;
  }

  /** The storefront default: lowest sortOrder published package, or null when none. */
  async defaultPublished(): Promise<PackageEntity | null> {
    return this.packages.findOne({
      where: { isPublished: true },
      order: { sortOrder: 'ASC', priceMinor: 'ASC' },
    });
  }

  async create(
    input: CreatePackageInput,
    actor: { userId: string | null; email: string | null },
  ): Promise<PackageEntity> {
    this.assertPrice(input.priceMinor);
    this.assertDevices(input.maxDevices ?? 1);
    const existing = await this.packages.findOne({ where: { code: input.code } });
    if (existing) throw new ConflictException('package_code_taken');
    const saved = await this.packages.save(
      this.packages.create({
        code: input.code,
        nameEn: input.nameEn,
        nameAr: input.nameAr,
        priceMinor: input.priceMinor,
        currency: (input.currency ?? 'SAR').toUpperCase(),
        maxDevices: input.maxDevices ?? 1,
        durationDays: input.durationDays ?? null,
        sortOrder: input.sortOrder ?? 0,
        isPublished: false,
      }),
    );
    await this.record('package.create', saved.id, actor, { code: saved.code });
    return saved;
  }

  async update(
    id: string,
    patch: UpdatePackageInput,
    actor: { userId: string | null; email: string | null },
  ): Promise<PackageEntity> {
    const pkg = await this.packages.findOne({ where: { id } });
    if (!pkg) throw new NotFoundException('package_not_found');
    if (patch.priceMinor !== undefined) {
      this.assertPrice(patch.priceMinor);
      pkg.priceMinor = patch.priceMinor;
    }
    if (patch.maxDevices !== undefined) {
      this.assertDevices(patch.maxDevices);
      pkg.maxDevices = patch.maxDevices;
    }
    if (patch.nameEn !== undefined) pkg.nameEn = patch.nameEn;
    if (patch.nameAr !== undefined) pkg.nameAr = patch.nameAr;
    if (patch.currency !== undefined) pkg.currency = patch.currency.toUpperCase();
    if (patch.durationDays !== undefined) pkg.durationDays = patch.durationDays;
    if (patch.sortOrder !== undefined) pkg.sortOrder = patch.sortOrder;
    if (patch.isPublished !== undefined) pkg.isPublished = patch.isPublished;
    const saved = await this.packages.save(pkg);
    await this.record('package.update', saved.id, actor, {
      code: saved.code,
      priceMinor: saved.priceMinor,
      isPublished: saved.isPublished,
    });
    return saved;
  }

  private assertPrice(priceMinor: number): void {
    if (!Number.isInteger(priceMinor) || priceMinor < 100 || priceMinor > 100_000_000) {
      throw new BadRequestException('invalid_price');
    }
  }

  private assertDevices(maxDevices: number): void {
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 10) {
      throw new BadRequestException('invalid_max_devices');
    }
  }

  private async record(
    action: string,
    id: string,
    actor: { userId: string | null; email: string | null },
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.record({
      action,
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'owner',
      resourceType: 'package',
      resourceId: id,
      result: 'success',
      metadata,
    });
  }
}
