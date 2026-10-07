import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import {
  CompatibilityRuleEntity,
  AppVersionEntity,
} from '../../database/entities/compatibility.entity';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { AuditService } from '../audit/audit.service';
import {
  IpaAttestation,
  IpaVerification,
  verifyIpaAttestation,
  verifyIpaSignature,
} from './ipa-signature';

@Injectable()
export class CompatibilityService {
  constructor(
    @InjectRepository(CompatibilityRuleEntity)
    private readonly rules: Repository<CompatibilityRuleEntity>,
    @InjectRepository(AppVersionEntity)
    private readonly appVersions: Repository<AppVersionEntity>,
    private readonly storage: LocalFileStorage,
    private readonly entitlements: EntitlementsService,
    private readonly audit: AuditService,
  ) {}

  customerDownloadAllowed(row: AppVersionEntity | null | undefined): boolean {
    return Boolean(
      row?.ipaPath &&
      row.isActive &&
      row.published &&
      row.signatureVerified &&
      row.checksum &&
      row.signatureSha256 === row.checksum &&
      row.signatureExpiresAt &&
      new Date(row.signatureExpiresAt).getTime() > Date.now(),
    );
  }

  async getPublic() {
    const rules = await this.rules.find({ order: { createdAt: 'DESC' } });
    const versions = await this.appVersions.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
    });
    return {
      rules: rules.map((r) => ({
        id: r.id,
        minIosVersion: r.minIosVersion,
        maxIosVersion: r.maxIosVersion,
        supportedModels: r.supportedModels,
        isSupported: r.isSupported,
        state: r.state ?? (r.isSupported ? 'SUPPORTED' : 'UNSUPPORTED'),
        minAppVersion: r.minAppVersion,
        lastVerifiedAt: r.lastVerifiedAt,
        notes: r.notes,
      })),
      appVersions: versions.map((v) => ({
        id: v.id,
        version: v.version,
        isMandatory: v.isMandatory,
        downloadUrl: v.ipaPath ? null : v.downloadUrl,
        releaseNotes: v.releaseNotes,
        checksum: v.checksum,
      })),
    };
  }

  async latestActive(): Promise<AppVersionEntity | null> {
    const rows = await this.appVersions.find({
      where: { isActive: true },
      order: { createdAt: 'DESC' },
      take: 1,
    });
    return rows[0] ?? null;
  }

  async upsertRule(input: {
    id?: string;
    minIosVersion: string;
    maxIosVersion?: string;
    supportedModels?: string[];
    isSupported?: boolean;
    state?: 'SUPPORTED' | 'TESTING' | 'UNSUPPORTED' | 'BLOCKED';
    minAppVersion?: string;
    lastVerifiedAt?: string;
    notes?: string;
  }): Promise<CompatibilityRuleEntity> {
    const state =
      input.state ??
      (input.isSupported === false ? 'UNSUPPORTED' : 'SUPPORTED');
    const patch = {
      minIosVersion: input.minIosVersion,
      maxIosVersion: input.maxIosVersion ?? null,
      supportedModels: input.supportedModels ?? null,
      isSupported: state === 'SUPPORTED' || state === 'TESTING',
      state,
      minAppVersion: input.minAppVersion ?? null,
      lastVerifiedAt: input.lastVerifiedAt
        ? new Date(input.lastVerifiedAt)
        : null,
      notes: input.notes ?? null,
    };
    if (input.id) {
      const existing = await this.rules.findOne({ where: { id: input.id } });
      if (!existing) throw new NotFoundException('Rule not found');
      Object.assign(existing, patch);
      return this.rules.save(existing);
    }
    return this.rules.save(this.rules.create(patch));
  }

  async deleteRule(id: string): Promise<{ ok: true }> {
    const rule = await this.rules.findOne({ where: { id } });
    if (!rule) throw new NotFoundException('Rule not found');
    await this.rules.remove(rule);
    return { ok: true };
  }

  async listAppVersions(): Promise<AppVersionEntity[]> {
    return this.appVersions.find({ order: { createdAt: 'DESC' } });
  }

  async listRules(): Promise<CompatibilityRuleEntity[]> {
    return this.rules.find({ order: { createdAt: 'DESC' } });
  }

  async createAppVersion(input: {
    version: string;
    isMandatory?: boolean;
    isActive?: boolean;
    downloadUrl?: string;
    releaseNotes?: string;
    checksum?: string;
  }): Promise<AppVersionEntity> {
    return this.appVersions.save(
      this.appVersions.create({
        version: input.version,
        isMandatory: input.isMandatory ?? false,
        isActive: input.isActive ?? true,
        downloadUrl: input.downloadUrl ?? null,
        releaseNotes: input.releaseNotes ?? null,
        checksum: input.checksum ?? null,
        ipaPath: null,
      }),
    );
  }

  async setAppVersionFlags(
    id: string,
    flags: { isActive?: boolean; isMandatory?: boolean },
  ): Promise<AppVersionEntity> {
    const row = await this.appVersions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('App version not found');
    if (flags.isActive !== undefined) row.isActive = flags.isActive;
    if (flags.isMandatory !== undefined) row.isMandatory = flags.isMandatory;
    return this.appVersions.save(row);
  }

  async attachIpa(
    id: string,
    bytes: Buffer,
    filename: string,
  ): Promise<AppVersionEntity> {
    if (!filename.toLowerCase().endsWith('.ipa')) {
      throw new BadRequestException('IPA upload must use a .ipa file');
    }
    if (bytes.length > 80 * 1024 * 1024) {
      throw new BadRequestException('IPA exceeds 80 MB');
    }
    const row = await this.appVersions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('App version not found');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const relative = `ipa/${row.id}/${row.version}.ipa`;
    await this.storage.writeBuffer(relative, bytes, 'application/octet-stream');
    const stored = await this.storage.readBuffer(relative);
    if (createHash('sha256').update(stored).digest('hex') !== checksum) {
      throw new BadRequestException('IPA verification failed');
    }
    row.ipaPath = relative;
    row.checksum = checksum;
    row.downloadUrl = null;
    row.signatureVerified = false;
    row.signatureStatus = 'unverified';
    row.signatureSha256 = null;
    row.signatureExpiresAt = null;
    row.signatureBundleId = null;
    row.published = false;
    row.publishedAt = null;
    return this.appVersions.save(row);
  }

  async publishRelease(
    id: string,
    actor: { userId: string | null; email: string | null },
    verifier: (bytes: Buffer) => Promise<IpaVerification> = verifyIpaSignature,
    attestation: IpaAttestation | null = null,
    publicKeyPem = process.env.IPA_VERIFICATION_PUBLIC_KEY ?? '',
  ): Promise<AppVersionEntity> {
    const row = await this.appVersions.findOne({ where: { id } });
    if (!row?.ipaPath) throw new NotFoundException('IPA is not available');
    const bytes = await this.storage.readBuffer(row.ipaPath);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (!row.checksum || checksum !== row.checksum) {
      throw new BadRequestException('IPA checksum mismatch');
    }
    const result = await verifier(bytes);
    const localOk = this.localVerificationMatches(result, checksum);
    const attested = !localOk && result.reason === 'verifier_unavailable' && attestation
      ? verifyIpaAttestation(attestation, publicKeyPem, checksum)
      : null;
    const storedOk = !localOk && !attested?.ok && result.reason === 'verifier_unavailable'
      && this.storedEvidenceMatches(row, checksum);
    if (!localOk && !attested?.ok && !storedOk) {
      row.signatureVerified = false;
      row.signatureStatus = attested?.reason ?? result.reason;
      row.published = false;
      row.publishedAt = null;
      await this.appVersions.save(row);
      await this.audit.record({
        action: 'app_version.publish',
        actorUserId: actor.userId,
        actorEmail: actor.email,
        actorType: 'owner',
        resourceType: 'app_version',
        resourceId: row.id,
        result: 'failure',
        metadata: { reason: row.signatureStatus, version: row.version },
      });
      throw new BadRequestException({
        error: 'release_unverified',
        message: 'This release is not published. Signature verification did not succeed.',
        reason: row.signatureStatus,
      });
    }
    row.signatureVerified = true;
    row.signatureSha256 = checksum;
    if (localOk) {
      row.signatureStatus = 'codesign_distribution';
      row.signatureBundleId = result.bundleId;
      row.signatureExpiresAt = result.profileExpiresAt ? new Date(result.profileExpiresAt) : null;
    } else if (attested?.ok && attestation) {
      row.signatureStatus = 'attested_distribution';
      row.signatureBundleId = attestation.bundleId;
      row.signatureExpiresAt = new Date(attestation.profileExpiresAt);
    }
    row.published = true;
    row.publishedAt = new Date();
    const saved = await this.appVersions.save(row);
    await this.audit.record({
      action: 'app_version.publish',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'owner',
      resourceType: 'app_version',
      resourceId: saved.id,
      result: 'success',
        metadata: { reason: saved.signatureStatus, version: saved.version },
    });
    return saved;
  }

  async unpublishRelease(
    id: string,
    actor: { userId: string | null; email: string | null },
  ): Promise<AppVersionEntity> {
    const row = await this.appVersions.findOne({ where: { id } });
    if (!row) throw new NotFoundException('App version not found');
    row.published = false;
    row.publishedAt = null;
    const saved = await this.appVersions.save(row);
    await this.audit.record({
      action: 'app_version.unpublish',
      actorUserId: actor.userId,
      actorEmail: actor.email,
      actorType: 'owner',
      resourceType: 'app_version',
      resourceId: saved.id,
      result: 'success',
      metadata: { version: saved.version },
    });
    return saved;
  }

  async readIpaForUser(userId: string, versionId: string): Promise<{
    bytes: Buffer;
    filename: string;
    checksum: string;
  }> {
    const { entitlement } = await this.entitlements.getForUser(userId);
    if (!entitlement || entitlement.status !== 'active') {
      throw new ForbiddenException('Active entitlement required');
    }
    const row = await this.appVersions.findOne({ where: { id: versionId } });
    if (!this.customerDownloadAllowed(row) || !row?.ipaPath || !row.checksum) {
      throw new NotFoundException('IPA is not available');
    }
    const bytes = await this.storage.readBuffer(row.ipaPath);
    const checksum = createHash('sha256').update(bytes).digest('hex');
    if (checksum !== row.checksum || checksum !== row.signatureSha256) {
      throw new BadRequestException('IPA checksum mismatch');
    }
    return { bytes, filename: `NAMAT-${row.version}.ipa`, checksum };
  }

  private localVerificationMatches(result: IpaVerification, checksum: string): boolean {
    if (!result.verified || result.reason !== 'codesign_distribution') return false;
    if (!result.sha256 || result.sha256 !== checksum) return false;
    if (!result.bundleId || !result.executable) return false;
    if (!result.profileExpiresAt || Date.parse(result.profileExpiresAt) <= Date.now()) return false;
    return true;
  }

  private storedEvidenceMatches(row: AppVersionEntity, checksum: string): boolean {
    if (!row.signatureVerified || row.signatureSha256 !== checksum) return false;
    if (row.signatureStatus !== 'codesign_distribution' && row.signatureStatus !== 'attested_distribution') {
      return false;
    }
    return Boolean(row.signatureExpiresAt && new Date(row.signatureExpiresAt).getTime() > Date.now());
  }
}
