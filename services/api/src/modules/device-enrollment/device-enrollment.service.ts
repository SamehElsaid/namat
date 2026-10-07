import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { MAX_ACTIVE_INSTALLATIONS } from '@namat/shared';
import { Repository } from 'typeorm';
import { DeviceEnrollmentEntity } from '../../database/entities/device-enrollment.entity';
import { DeviceEntity } from '../../database/entities/device.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import {
  SigningJobEntity,
  SigningLockEntity,
} from '../../database/entities/signing-job.entity';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { AuditService } from '../audit/audit.service';
import {
  AppleProvisioningError,
  type AppleProvisioningProvider,
} from './apple-provisioning';
import {
  chooseSigningMode,
  customerMessage,
  developerModeRequired,
  parseInstallStrategy,
  type InstallStrategy,
} from './install-strategy';
import {
  inspectUntrustedCms,
  verifyDeviceCms,
  type SignerCertificateMetadata,
} from './cms-device-response';
import { assertIpaBytes } from './ipa-bytes';
import {
  buildEnrollmentProfile,
  buildInstallManifest,
  signMobileconfig,
} from './mobileconfig';
import { parseVerifiedDevicePlist } from './plist';
import { type SigningDispatcher } from './signing-dispatcher';
import {
  decryptSecret,
  encryptSecret,
  fingerprintIdentifier,
  hashSecret,
} from './udid-crypto';
export const APPLE_PROVISIONING = 'APPLE_PROVISIONING';
export const SIGNING_DISPATCHER = 'SIGNING_DISPATCHER';

export interface CustomerEnrollment {
  id: string;
  status: string;
  signingStatus: string | null;
  installStrategy: string;
  label: string | null;
  product: string | null;
  iosVersion: string | null;
  expiresAt: string;
  failureCode: string | null;
  customerMessage: string | null;
  developerModeRequired: boolean;
  profileUrl: string | null;
  activated: boolean;
}

function publicCertificate(input: SignerCertificateMetadata): SignerCertificateMetadata {
  return {
    subject: input.subject,
    issuer: input.issuer,
    serial: input.serial,
    fingerprintSha256: input.fingerprintSha256,
    notBefore: input.notBefore,
    notAfter: input.notAfter,
  };
}

const LOCK_ID = 'ad-hoc';
const STABLE_MANIFEST = 'stable/manifest.json';
const JOB_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StableReleaseIdentity {
  sourceCommit: string;
  airliftSha: string;
  appVersion: string;
  buildNumber: string;
  unsignedIpaSha256: string;
  relativePath: string;
}

@Injectable()
export class DeviceEnrollmentService {
  /** Redacted operational notes. Tests assert the raw device identifier never appears. */
  readonly debugLines: string[] = [];

  constructor(
    @InjectRepository(DeviceEnrollmentEntity)
    private readonly enrollments: Repository<DeviceEnrollmentEntity>,
    @InjectRepository(SigningJobEntity)
    private readonly jobs: Repository<SigningJobEntity>,
    @InjectRepository(SigningLockEntity)
    private readonly locks: Repository<SigningLockEntity>,
    @InjectRepository(EntitlementEntity)
    private readonly entitlements: Repository<EntitlementEntity>,
    @InjectRepository(DeviceEntity)
    private readonly devices: Repository<DeviceEntity>,
    private readonly auditLog: AuditService,
    private readonly config: ConfigService,
    private readonly storage: LocalFileStorage,
    @Inject(APPLE_PROVISIONING)
    private readonly apple: AppleProvisioningProvider,
    @Inject(SIGNING_DISPATCHER)
    private readonly dispatcher: SigningDispatcher,
  ) {}

  async start(userId: string): Promise<CustomerEnrollment> {
    const entitlement = await this.requireEntitlement(userId);
    const strategy = await this.resolveStrategy();
    if (strategy === 'UNAVAILABLE' || strategy === 'TESTFLIGHT') {
      const code = await this.unavailableCode(strategy);
      const row = await this.insertFailed(userId, strategy, code);
      await this.record('DEVICE_ENROLLMENT_STARTED', userId, row.id, {
        strategy,
        result: code,
      });
      return this.toCustomer(row);
    }
    if (!(await this.productionInstallReady(strategy))) {
      const row = await this.insertFailed(userId, strategy, 'install_unavailable');
      await this.record('DEVICE_ENROLLMENT_STARTED', userId, row.id, {
        strategy,
        result: 'install_unavailable',
      });
      return this.toCustomer(row);
    }

    const reusable = this.openDiscovered(
      await this.rowsForUser(userId),
    );
    if (reusable) return this.toCustomer(reusable);

    await this.assertSlot(userId, entitlement.maxDevices ?? MAX_ACTIVE_INSTALLATIONS);
    const token = randomBytes(32).toString('base64url');
    const challenge = randomBytes(32).toString('base64url');
    const ttl = Number(this.config.get('app.enrollmentTtlSeconds') ?? 900);
    const now = new Date();
    const row = await this.enrollments.save(
      this.enrollments.create({
        id: randomUUID(),
        userId,
        tokenHash: hashSecret(token),
        tokenCipher: encryptSecret(token, this.dataKey()),
        challengeCipher: encryptSecret(challenge, this.dataKey()),
        cmsDiagnostic: null,
        status: 'DISCOVERED',
        signingStatus: null,
        installStrategy: strategy,
        expiresAt: new Date(now.getTime() + ttl * 1000),
        consumedAt: null,
        deactivatedAt: null,
        udidCipher: null,
        udidFingerprint: null,
        product: null,
        iosVersion: null,
        appleDeviceId: null,
        appleState: strategy === 'AD_HOC_SELF_SERVICE' ? 'pending' : 'not_required',
        profileId: null,
        failureCode: null,
        label: 'iPhone',
        namatInstallationId: null,
        activatedAt: null,
        manifestTokenHash: null,
        manifestExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    await this.record('DEVICE_ENROLLMENT_STARTED', userId, row.id, { strategy });
    this.note('enrollment started', { enrollmentId: row.id });
    return this.toCustomer(row);
  }

  async listForUser(userId: string): Promise<CustomerEnrollment[]> {
    const rows = await this.rowsForUser(userId);
    rows.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return rows.map((row) => this.toCustomer(row));
  }

  async getForUser(userId: string, id: string): Promise<CustomerEnrollment> {
    return this.toCustomer(await this.owned(userId, id));
  }

  async profileBody(token: string): Promise<Buffer | string> {
    const session = await this.requireOpenToken(token);
    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
    const challenge = this.expectedChallenge(session);
    if (!challenge) throw new ServiceUnavailableException('install_unavailable');
    const xml = buildEnrollmentProfile({
      callbackUrl: this.callbackUrl(token),
      nodeEnv,
      challenge,
    });
    const signed = signMobileconfig(
      xml,
      this.config.get<string>('app.profileSigningCert') ?? '',
      this.config.get<string>('app.profileSigningKey') ?? '',
    );
    if (!signed && nodeEnv === 'production') {
      throw new ServiceUnavailableException('install_unavailable');
    }
    this.note('profile issued', { enrollmentId: session.id });
    return signed ?? xml;
  }

  async completeCallback(
    token: string,
    body: Buffer,
    contentType: string | undefined,
  ): Promise<DeviceEnrollmentEntity> {
    if ((contentType ?? '').toLowerCase().includes('application/json')) {
      throw new BadRequestException('unsupported_enrollment_body');
    }
    const session = await this.findByToken(token);
    if (!session) throw new NotFoundException('enrollment_not_found');
    if (session.consumedAt) {
      session.failureCode = 'replay';
      await this.enrollments.save(session);
      throw new ConflictException('replay');
    }
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      session.status = 'EXPIRED';
      session.failureCode = 'expired';
      session.consumedAt = new Date();
      session.tokenCipher = null;
      await this.enrollments.save(session);
      throw new GoneException('expired');
    }

    if (this.diagnosticEnabled()) {
      await this.recordCmsDiagnostic(session, body);
      throw new BadRequestException('diagnostic_only');
    }

    const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
    let attrs: ReturnType<typeof parseVerifiedDevicePlist>;
    let signerFingerprint = '';
    try {
      const verified = verifyDeviceCms(body, {
        trustBundlePem: this.config.get<string>('app.enrollmentCmsTrustBundlePem') ?? '',
        allowLegacyIphoneDeviceCa:
          this.config.get<boolean>('app.enrollmentAllowLegacyIphoneDeviceCa') === true,
        nodeEnv,
      });
      attrs = parseVerifiedDevicePlist(verified.xml);
      signerFingerprint = verified.signer.fingerprintSha256;
    } catch {
      throw new BadRequestException('unsupported_enrollment_body');
    }
    const expectedChallenge = this.expectedChallenge(session);
    if (
      !expectedChallenge ||
      !this.secretsMatch(expectedChallenge, attrs.challenge)
    ) {
      throw new BadRequestException('unsupported_enrollment_body');
    }

    await this.requireEntitlement(session.userId);
    const fingerprint = fingerprintIdentifier(attrs.udid);
    const others = (
      await this.enrollments.find({ where: { udidFingerprint: fingerprint } })
    ).filter((row) => row.id !== session.id);
    const foreign = others.find(
      (row) =>
        row.userId !== session.userId &&
        !row.deactivatedAt &&
        row.status !== 'FAILED' &&
        row.status !== 'EXPIRED',
    );
    if (foreign) {
      session.status = 'FAILED';
      session.failureCode = 'device_owned_by_another_account';
      session.consumedAt = new Date();
      session.tokenCipher = null;
      await this.enrollments.save(session);
      this.note('enrollment rejected', {
        enrollmentId: session.id,
        reason: 'other_account',
      });
      throw new ConflictException('device_owned_by_another_account');
    }

    session.udidCipher = encryptSecret(attrs.udid, this.dataKey());
    session.udidFingerprint = fingerprint;
    session.product = attrs.product ?? null;
    session.iosVersion = attrs.version ?? null;
    session.consumedAt = new Date();
    session.tokenCipher = null;
    session.label = attrs.product ? `iPhone · ${attrs.product}` : 'iPhone';
    session.status = 'REGISTERING';
    session.updatedAt = new Date();
    await this.enrollments.save(session);
    this.note('device registered', {
      enrollmentId: session.id,
      fingerprintPrefix: fingerprint.slice(0, 8),
      signerFingerprint,
    });
    await this.record('DEVICE_REGISTERED', session.userId, session.id, {
      fingerprintPrefix: fingerprint.slice(0, 8),
      signerFingerprint,
    });

    if (session.installStrategy === 'AD_HOC_SELF_SERVICE') {
      await this.enqueueAndPump(session);
    } else if (session.installStrategy === 'USER_SIDE_SIGNING') {
      session.status = 'REGISTERED';
      session.appleState = 'not_required';
      await this.enrollments.save(session);
    } else {
      session.status = 'FAILED';
      session.failureCode = 'install_unavailable';
      await this.enrollments.save(session);
    }
    return session;
  }

  async issueInstallLink(userId: string, enrollmentId: string) {
    const row = await this.owned(userId, enrollmentId);
    if (row.deactivatedAt || row.signingStatus !== 'READY') {
      throw new BadRequestException('install_not_ready');
    }
    await this.requireEntitlement(userId);
    const token = randomBytes(24).toString('base64url');
    row.manifestTokenHash = hashSecret(token);
    row.manifestExpiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await this.enrollments.save(row);
    const manifestUrl = `${this.publicBase()}/api/v1/device-enrollment/manifest/${token}`;
    return {
      manifestUrl,
      installUrl: `itms-services://?action=download-manifest&url=${encodeURIComponent(manifestUrl)}`,
    };
  }

  async manifestForToken(token: string): Promise<string> {
    const row = await this.findByManifest(token);
    const job = await this.latestReadyJob(row.id);
    const ipaUrl = `${this.publicBase()}/api/v1/device-enrollment/ipa/${token}`;
    return buildInstallManifest({
      ipaUrl,
      bundleVersion: job?.appVersion ?? '1.0.0',
    });
  }

  async ipaRelativePath(token: string): Promise<string> {
    const row = await this.findByManifest(token);
    const job = await this.latestReadyJob(row.id);
    if (!job?.artifactRelativePath || !(await this.storage.exists(job.artifactRelativePath))) {
      throw new NotFoundException('install_artifact_missing');
    }
    return job.artifactRelativePath;
  }

  async rename(userId: string, id: string, label: string): Promise<CustomerEnrollment> {
    const row = await this.owned(userId, id);
    const clean = label.trim().slice(0, 64);
    if (!clean) throw new BadRequestException('label_required');
    row.label = clean;
    await this.enrollments.save(row);
    return this.toCustomer(row);
  }

  async deactivate(enrollmentId: string, actorUserId: string | null): Promise<void> {
    const row = await this.must(enrollmentId);
    if (actorUserId && row.userId !== actorUserId) {
      throw new ForbiddenException('enrollment_forbidden');
    }
    row.deactivatedAt = new Date();
    await this.enrollments.save(row);
    if (row.namatInstallationId) {
      const device = await this.devices.findOne({
        where: {
          userId: row.userId,
          installationId: row.namatInstallationId,
          status: 'active',
        },
      });
      if (device) {
        device.status = 'inactive';
        device.deactivatedAt = new Date();
        await this.devices.save(device);
      }
    }
    await this.record('DEVICE_DEACTIVATED', row.userId, row.id, {
      scope: 'enrollment',
    });
  }

  async linkInstallation(userId: string, installationId: string): Promise<void> {
    const rows = (await this.rowsForUser(userId)).filter(
      (row) => !row.deactivatedAt && !row.namatInstallationId,
    );
    const target =
      rows.find((row) => row.status === 'INSTALL_READY') ??
      rows.find((row) => row.status === 'REGISTERED');
    if (!target) return;
    target.namatInstallationId = installationId;
    target.activatedAt = new Date();
    await this.enrollments.save(target);
    await this.record('INSTALLATION_ACTIVATED', userId, target.id, {
      installationId,
    });
  }

  async deactivateByInstallation(
    userId: string,
    installationId: string,
  ): Promise<void> {
    const rows = (await this.rowsForUser(userId)).filter(
      (row) => row.namatInstallationId === installationId && !row.deactivatedAt,
    );
    for (const row of rows) {
      row.deactivatedAt = new Date();
      await this.enrollments.save(row);
      await this.record('DEVICE_DEACTIVATED', userId, row.id, {
        installationId,
      });
    }
  }

  async retrySigning(enrollmentId: string) {
    return this.requeue(enrollmentId);
  }

  async retryProvisioning(enrollmentId: string) {
    return this.requeue(enrollmentId);
  }

  async adminList() {
    const rows = await this.enrollments.find();
    const devices = await this.devices.find();
    return rows
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((row) => {
        const device = devices.find(
          (item) => item.installationId === row.namatInstallationId,
        );
        return {
          id: row.id,
          userId: row.userId,
          status: row.status,
          signingStatus: row.signingStatus,
          installStrategy: row.installStrategy,
          appleState: row.appleState,
          fingerprintPrefix: row.udidFingerprint
            ? row.udidFingerprint.slice(0, 8)
            : null,
          label: row.label,
          product: row.product,
          iosVersion: row.iosVersion,
          failureCode: row.failureCode,
          namatInstallationId: row.namatInstallationId,
          appVersion: device?.appVersion ?? null,
          activatedAt: row.activatedAt,
          createdAt: row.createdAt,
          deactivatedAt: row.deactivatedAt,
        };
      });
  }

  async adminCapacity() {
    const rows = await this.enrollments.find();
    const pendingRegistrations = rows.filter(
      (row) =>
        !row.deactivatedAt &&
        (row.appleState === 'pending' ||
          row.signingStatus === 'QUEUED' ||
          row.signingStatus === 'REGISTERING_DEVICE'),
    ).length;
    const registrationFailures = rows.filter(
      (row) =>
        row.appleState === 'failed' ||
        row.failureCode === 'capacity_exhausted' ||
        row.failureCode === 'apple_register_failed',
    ).length;
    const configured = this.apple.isConfigured();
    const cap = configured ? await this.apple.capacity().catch(() => null) : null;
    return {
      configured,
      strategy: await this.resolveStrategy(),
      registeredIphoneCount: cap?.registeredIphoneCount ?? null,
      remaining: cap?.remaining ?? null,
      limit:
        cap?.limit ??
        Number(this.config.get('app.appleAdHocDeviceLimit') ?? 100),
      pendingRegistrations,
      registrationFailures,
    };
  }

  async storeSignedIpa(
    jobId: string,
    presentedSecret: string,
    bytes: Buffer,
    claimedSha256: string,
  ): Promise<{ artifactId: string; artifactRelativePath: string; ipaSha256: string }> {
    this.assertCallbackAuth(presentedSecret);
    if (!JOB_ID_RE.test(jobId)) throw new NotFoundException('signing_job_not_found');
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('signing_job_not_found');
    if (job.status !== 'SIGNING') throw new ConflictException('job_not_signing');
    let ipa: Buffer;
    try {
      assertIpaBytes(bytes, this.maxIpaBytes());
      ipa = bytes;
    } catch {
      throw new BadRequestException('ipa_invalid');
    }
    const actual = createHash('sha256').update(ipa).digest('hex');
    if (!this.secretsMatch(actual, claimedSha256.trim().toLowerCase())) {
      throw new ConflictException('checksum_mismatch');
    }
    const relative = `signed-ipa/${job.id}.ipa`;
    this.storage.resolveInsideRoot(relative);
    await this.storage.writeBuffer(relative, ipa, 'application/octet-stream');
    const stored = await this.storage.readBuffer(relative);
    const storedHash = createHash('sha256').update(stored).digest('hex');
    if (!this.secretsMatch(storedHash, actual)) {
      throw new ConflictException('checksum_mismatch');
    }
    job.ipaSha256 = storedHash;
    job.artifactRelativePath = relative;
    job.updatedAt = new Date();
    await this.jobs.save(job);
    this.note('signed ipa stored', { jobId: job.id, bytes: stored.length });
    return {
      artifactId: job.id,
      artifactRelativePath: relative,
      ipaSha256: storedHash,
    };
  }

  async publishStablePayload(
    bytes: Buffer,
    meta: {
      sourceCommit: string;
      airliftSha: string;
      appVersion: string;
      buildNumber: string;
    },
  ): Promise<StableReleaseIdentity> {
    let ipa: Buffer;
    try {
      assertIpaBytes(bytes, this.maxIpaBytes());
      ipa = bytes;
    } catch {
      throw new BadRequestException('ipa_invalid');
    }
    const identity = {
      sourceCommit: this.cleanIdentity(meta.sourceCommit),
      airliftSha: this.cleanIdentity(meta.airliftSha),
      appVersion: this.cleanIdentity(meta.appVersion),
      buildNumber: this.cleanIdentity(meta.buildNumber),
    };
    const sha = createHash('sha256').update(ipa).digest('hex');
    const relativePath = `stable/unsigned-${sha}.ipa`;
    this.storage.resolveInsideRoot(relativePath);
    await this.storage.writeBuffer(relativePath, ipa, 'application/octet-stream');
    const published: StableReleaseIdentity = {
      ...identity,
      unsignedIpaSha256: sha,
      relativePath,
    };
    await this.storage.writeBuffer(
      STABLE_MANIFEST,
      Buffer.from(JSON.stringify(published)),
      'application/json',
    );
    return published;
  }

  async stableManifest(presentedSecret: string): Promise<StableReleaseIdentity> {
    this.assertCallbackAuth(presentedSecret);
    const manifest = await this.readStableManifest();
    if (!manifest) throw new NotFoundException('stable_payload_missing');
    return manifest;
  }

  async stablePayload(
    presentedSecret: string,
    claimedSha256: string | undefined,
  ): Promise<Buffer> {
    this.assertCallbackAuth(presentedSecret);
    const loaded = await this.readStablePayload();
    if (!loaded) throw new NotFoundException('stable_payload_missing');
    if (
      claimedSha256 &&
      !this.secretsMatch(loaded.identity.unsignedIpaSha256, claimedSha256.trim().toLowerCase())
    ) {
      throw new ConflictException('checksum_mismatch');
    }
    return loaded.bytes;
  }

  async completeSigningJob(
    jobId: string,
    presentedSecret: string,
    result: {
      ipaSha256: string;
      profileIdentifier: string;
      appVersion: string;
      buildNumber: string;
      sourceCommit: string;
      airliftSha: string;
    },
  ): Promise<void> {
    this.assertCallbackAuth(presentedSecret);
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('signing_job_not_found');
    if (job.status === 'READY') {
      if (!(await this.storedIpaMatches(job, job.ipaSha256 ?? ''))) {
        throw new ConflictException('artifact_missing');
      }
      return;
    }
    if (job.status !== 'SIGNING') throw new ConflictException('job_not_signing');
    if (!(await this.storedIpaMatches(job, result.ipaSha256))) {
      const missing = !job.artifactRelativePath || !(await this.storage.exists(job.artifactRelativePath));
      throw new ConflictException(missing ? 'artifact_missing' : 'checksum_mismatch');
    }
    const session = await this.must(job.enrollmentId);
    await this.markReady(job, session, result);
    await this.pumpQueue();
  }

  async failSigningJob(jobId: string, presentedSecret: string): Promise<void> {
    this.assertCallbackAuth(presentedSecret);
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job) throw new NotFoundException('signing_job_not_found');
    if (job.status === 'READY' || job.status === 'FAILED') return;
    const session = await this.must(job.enrollmentId);
    await this.failJob(job, session, 'signing_failed');
    await this.pumpQueue();
  }

  async jobProfile(jobId: string, presentedSecret: string): Promise<Buffer> {
    this.assertCallbackAuth(presentedSecret);
    const job = await this.jobs.findOne({ where: { id: jobId } });
    if (!job?.profileCipher) throw new NotFoundException('profile_not_ready');
    const content = decryptSecret(job.profileCipher, this.dataKey());
    return Buffer.from(content, 'base64');
  }

  private async requeue(enrollmentId: string) {
    const session = await this.must(enrollmentId);
    if (!session.udidCipher || session.deactivatedAt) {
      throw new BadRequestException('enrollment_not_retryable');
    }
    const active = (
      await this.jobs.find({ where: { enrollmentId: session.id } })
    ).filter(
      (job) =>
        ['QUEUED', 'REGISTERING_DEVICE', 'GENERATING_PROFILE', 'SIGNING'].includes(
          job.status,
        ),
    );
    for (const job of active) {
      job.status = 'FAILED';
      job.failureCode = 'superseded';
      await this.jobs.save(job);
    }
    session.status = 'REGISTERING';
    session.failureCode = null;
    await this.enrollments.save(session);
    await this.enqueueAndPump(session);
    return this.adminList().then((rows) => rows.find((row) => row.id === session.id));
  }

  private pumping = false;

  private async enqueueAndPump(session: DeviceEnrollmentEntity): Promise<void> {
    const attempt =
      (await this.jobs.find({ where: { enrollmentId: session.id } })).length + 1;
    const now = new Date();
    await this.jobs.save(
      this.jobs.create({
        id: randomUUID(),
        enrollmentId: session.id,
        status: 'QUEUED',
        mode: this.signingMode(),
        attempt,
        failureCode: null,
        ipaSha256: null,
        profileIdentifier: null,
        profileCipher: null,
        appVersion: null,
        buildNumber: null,
        sourceCommit: null,
        airliftSha: null,
        artifactRelativePath: null,
        signingTimestamp: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
    session.signingStatus = 'QUEUED';
    session.failureCode = null;
    await this.enrollments.save(session);
    await this.pumpQueue();
  }

  private async pumpQueue(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      for (;;) {
        const job = await this.nextQueued();
        if (!job) return;
        const locked = await this.acquire(job.id);
        if (!locked) return;
        try {
          await this.runJob(job);
        } finally {
          await this.release(job.id);
        }
      }
    } finally {
      this.pumping = false;
    }
  }

  private async runJob(job: SigningJobEntity): Promise<void> {
    const session = await this.must(job.enrollmentId);
    let udid = '';
    try {
      udid = decryptSecret(session.udidCipher ?? '', this.dataKey());
      await this.setSigning(job, session, 'REGISTERING_DEVICE');
      const registered = await this.apple.registerDevice({
        udid,
        name: `NAMAT ${session.id.slice(0, 8)}`,
      });
      session.appleDeviceId = registered.appleDeviceId;
      session.appleState = 'registered';
      await this.enrollments.save(session);
      await this.record('APPLE_DEVICE_REGISTERED', session.userId, session.id, {
        appleDeviceId: registered.appleDeviceId,
        alreadyRegistered: registered.alreadyRegistered,
      });

      await this.setSigning(job, session, 'GENERATING_PROFILE');
      const deviceIds = await this.collectAppleDeviceIds(registered.appleDeviceId);
      const profile = await this.apple.regenerateProfile(deviceIds);
      session.profileId = profile.profileId;
      job.profileIdentifier = profile.profileId;
      job.profileCipher = encryptSecret(
        profile.profileContentBase64,
        this.dataKey(),
      );
      await this.jobs.save(job);
      await this.enrollments.save(session);

      await this.setSigning(job, session, 'SIGNING');
      await this.record('SIGNING_STARTED', session.userId, session.id, {
        jobId: job.id,
        mode: job.mode,
      });
      const dispatched = await this.dispatcher.dispatch({
        id: job.id,
        mode: job.mode,
        enrollmentId: session.id,
      });
      if (!dispatched.accepted) {
        await this.failJob(job, session, 'signing_dispatcher_unconfigured');
        return;
      }
      // Dispatch only starts the runner. INSTALL_READY waits for a stored IPA.
    } catch (err) {
      const code =
        err instanceof AppleProvisioningError ? err.code : 'signing_failed';
      session.appleState = code.startsWith('apple') || code === 'capacity_exhausted'
        ? 'failed'
        : session.appleState;
      await this.failJob(job, session, code);
    } finally {
      udid = '';
    }
  }

  private async markReady(
    job: SigningJobEntity,
    session: DeviceEnrollmentEntity,
    result: {
      ipaSha256: string;
      profileIdentifier: string;
      appVersion: string;
      buildNumber: string;
      sourceCommit: string;
      airliftSha: string;
    },
  ): Promise<void> {
    const now = new Date();
    job.status = 'READY';
    job.ipaSha256 = result.ipaSha256.trim().toLowerCase();
    job.profileIdentifier = result.profileIdentifier;
    job.appVersion = result.appVersion;
    job.buildNumber = result.buildNumber;
    job.sourceCommit = result.sourceCommit;
    job.airliftSha = result.airliftSha;
    job.signingTimestamp = now;
    job.failureCode = null;
    session.status = 'INSTALL_READY';
    session.signingStatus = 'READY';
    session.failureCode = null;
    session.profileId = result.profileIdentifier;
    await this.jobs.save(job);
    await this.enrollments.save(session);
    this.note('signing state', { jobId: job.id, status: 'READY' });
    await this.record('SIGNING_COMPLETED', session.userId, session.id, {
      jobId: job.id,
      ipaSha256: result.ipaSha256,
      appVersion: result.appVersion,
      buildNumber: result.buildNumber,
      sourceCommit: result.sourceCommit,
      airliftSha: result.airliftSha,
      mode: job.mode,
    });
  }

  private async failJob(
    job: SigningJobEntity,
    session: DeviceEnrollmentEntity,
    code: string,
  ): Promise<void> {
    job.status = 'FAILED';
    job.failureCode = code;
    session.signingStatus = 'FAILED';
    session.status = 'FAILED';
    session.failureCode = code;
    await this.jobs.save(job);
    await this.enrollments.save(session);
    this.note('signing state', { jobId: job.id, status: 'FAILED', code });
  }

  private async setSigning(
    job: SigningJobEntity,
    session: DeviceEnrollmentEntity,
    status: 'REGISTERING_DEVICE' | 'GENERATING_PROFILE' | 'SIGNING',
  ): Promise<void> {
    job.status = status;
    session.signingStatus = status;
    if (status === 'REGISTERING_DEVICE') session.status = 'REGISTERING';
    await this.jobs.save(job);
    await this.enrollments.save(session);
    this.note('signing state', { jobId: job.id, status });
  }

  private async collectAppleDeviceIds(currentId: string): Promise<string[]> {
    const ids = new Set<string>([currentId]);
    for (const row of await this.enrollments.find()) {
      if (row.appleDeviceId) ids.add(row.appleDeviceId);
    }
    return [...ids];
  }

  private signingMode(): 'RESIGN' | 'FULL_REBUILD' {
    const identity = {
      sourceCommit: this.config.get<string>('app.stableSourceCommit') ?? '',
      airliftSha: this.config.get<string>('app.stableAirliftSha') ?? '',
      appVersion: this.config.get<string>('app.stableAppVersion') ?? '',
    };
    if (!identity.sourceCommit || !identity.airliftSha || !identity.appVersion) {
      return chooseSigningMode(null, identity);
    }
    return chooseSigningMode(identity, identity);
  }

  private async nextQueued(): Promise<SigningJobEntity | null> {
    const queued = await this.jobs.find({ where: { status: 'QUEUED' } });
    queued.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    return queued[0] ?? null;
  }

  private async acquire(jobId: string): Promise<boolean> {
    const now = Date.now();
    let row = await this.locks.findOne({ where: { id: LOCK_ID } });
    if (
      row?.ownerJobId &&
      row.ownerJobId !== jobId &&
      row.lockedUntil &&
      new Date(row.lockedUntil).getTime() > now
    ) {
      return false;
    }
    const until = new Date(now + 15 * 60 * 1000);
    if (!row) {
      row = this.locks.create({
        id: LOCK_ID,
        ownerJobId: jobId,
        lockedUntil: until,
      });
    } else {
      row.ownerJobId = jobId;
      row.lockedUntil = until;
    }
    await this.locks.save(row);
    return true;
  }

  private async release(jobId: string): Promise<void> {
    const row = await this.locks.findOne({ where: { id: LOCK_ID } });
    if (!row || row.ownerJobId !== jobId) return;
    row.ownerJobId = null;
    row.lockedUntil = null;
    await this.locks.save(row);
  }

  /**
   * Owner build access: the most recent signed IPA across all enrollments.
   * Returns metadata only (no file path) for display.
   */
  async latestSignedBuildMeta(): Promise<{
    available: boolean;
    jobId: string | null;
    appVersion: string | null;
    buildNumber: string | null;
    ipaSha256: string | null;
    sizeBytes: number | null;
    createdAt: string | null;
  }> {
    const job = await this.newestSignedJob();
    if (!job) {
      return {
        available: false,
        jobId: null,
        appVersion: null,
        buildNumber: null,
        ipaSha256: null,
        sizeBytes: null,
        createdAt: null,
      };
    }
    let sizeBytes: number | null = null;
    try {
      if (job.artifactRelativePath) {
        sizeBytes = await this.storage.sizeOf(job.artifactRelativePath);
      }
    } catch {
      sizeBytes = null;
    }
    return {
      available: true,
      jobId: job.id,
      appVersion: job.appVersion,
      buildNumber: job.buildNumber,
      ipaSha256: job.ipaSha256,
      sizeBytes,
      createdAt:
        job.createdAt instanceof Date ? job.createdAt.toISOString() : String(job.createdAt),
    };
  }

  /** Owner build access: the file path of the most recent signed IPA. */
  async latestSignedBuildPath(): Promise<string> {
    const job = await this.newestSignedJob();
    if (!job?.artifactRelativePath || !(await this.storage.exists(job.artifactRelativePath))) {
      throw new NotFoundException('no_signed_build');
    }
    return job.artifactRelativePath;
  }

  private async newestSignedJob(): Promise<SigningJobEntity | null> {
    const ready = await this.jobs.find({ where: { status: 'READY' } });
    const withArtifact = ready.filter((j) => j.artifactRelativePath);
    withArtifact.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return withArtifact[0] ?? null;
  }

  private async latestReadyJob(enrollmentId: string): Promise<SigningJobEntity | null> {
    const ready = await this.jobs.find({
      where: { enrollmentId, status: 'READY' },
    });
    ready.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
    return ready[0] ?? null;
  }

  private async resolveStrategy(): Promise<InstallStrategy> {
    const configured = parseInstallStrategy(
      this.config.get<string>('app.installStrategy'),
    );
    if (configured !== 'AD_HOC_SELF_SERVICE') return configured;
    if (!this.apple.isConfigured()) return 'UNAVAILABLE';
    try {
      const cap = await this.apple.capacity();
      if (cap && cap.remaining <= 0) return 'UNAVAILABLE';
    } catch {
      return 'UNAVAILABLE';
    }
    return 'AD_HOC_SELF_SERVICE';
  }

  private async unavailableCode(strategy: InstallStrategy): Promise<string> {
    if (strategy === 'TESTFLIGHT') return 'testflight_not_configured';
    if (this.apple.isConfigured()) {
      try {
        const cap = await this.apple.capacity();
        if (cap && cap.remaining <= 0) return 'capacity_exhausted';
      } catch {
        return 'install_unavailable';
      }
    }
    return 'install_unavailable';
  }

  private async insertFailed(
    userId: string,
    strategy: string,
    code: string,
  ): Promise<DeviceEnrollmentEntity> {
    const now = new Date();
    return this.enrollments.save(
      this.enrollments.create({
        id: randomUUID(),
        userId,
        tokenHash: hashSecret(randomUUID()),
        tokenCipher: null,
        challengeCipher: null,
        cmsDiagnostic: null,
        status: 'FAILED',
        signingStatus: 'FAILED',
        installStrategy: strategy,
        expiresAt: now,
        consumedAt: null,
        deactivatedAt: null,
        udidCipher: null,
        udidFingerprint: null,
        product: null,
        iosVersion: null,
        appleDeviceId: null,
        appleState: null,
        profileId: null,
        failureCode: code,
        label: null,
        namatInstallationId: null,
        activatedAt: null,
        manifestTokenHash: null,
        manifestExpiresAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  private async assertSlot(userId: string, max: number): Promise<void> {
    // Commercial limit: one active NAMAT installation. An in-progress
    // enrollment is not a second iPhone. Apple device capacity is separate.
    const active = (
      await this.devices.find({ where: { userId, status: 'active' } })
    ).length;
    if (active >= max) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'DeviceLimitExceeded',
        message: `Maximum of ${max} active installations allowed. Deactivate a device first.`,
        maxDevices: max,
      });
    }
  }

  private openDiscovered(rows: DeviceEnrollmentEntity[]): DeviceEnrollmentEntity | null {
    return (
      rows.find(
        (row) =>
          row.status === 'DISCOVERED' &&
          !row.consumedAt &&
          !row.deactivatedAt &&
          row.tokenCipher &&
          new Date(row.expiresAt).getTime() > Date.now(),
      ) ?? null
    );
  }

  private async requireEntitlement(userId: string): Promise<EntitlementEntity> {
    const entitlement = await this.entitlements.findOne({
      where: { userId, status: 'active' },
    });
    if (!entitlement) {
      throw new ForbiddenException('Active entitlement required');
    }
    return entitlement;
  }

  private async requireOpenToken(token: string): Promise<DeviceEnrollmentEntity> {
    const session = await this.findByToken(token);
    if (!session) throw new NotFoundException('enrollment_not_found');
    if (session.consumedAt) throw new GoneException('replay');
    if (new Date(session.expiresAt).getTime() < Date.now()) {
      session.status = 'EXPIRED';
      session.failureCode = 'expired';
      await this.enrollments.save(session);
      throw new GoneException('expired');
    }
    return session;
  }

  private async findByToken(token: string): Promise<DeviceEnrollmentEntity | null> {
    const hash = hashSecret(token);
    return this.enrollments.findOne({ where: { tokenHash: hash } });
  }

  private async findByManifest(token: string): Promise<DeviceEnrollmentEntity> {
    const hash = hashSecret(token);
    const row = await this.enrollments.findOne({
      where: { manifestTokenHash: hash },
    });
    if (!row) throw new NotFoundException('manifest_not_found');
    if (
      !row.manifestExpiresAt ||
      new Date(row.manifestExpiresAt).getTime() < Date.now()
    ) {
      throw new GoneException('manifest_expired');
    }
    // A link issued before a refund or device removal must stop working.
    if (row.deactivatedAt) throw new GoneException('manifest_expired');
    await this.requireEntitlement(row.userId);
    return row;
  }

  private async owned(userId: string, id: string): Promise<DeviceEnrollmentEntity> {
    const row = await this.must(id);
    if (row.userId !== userId) throw new NotFoundException('enrollment_not_found');
    return row;
  }

  private async must(id: string): Promise<DeviceEnrollmentEntity> {
    const row = await this.enrollments.findOne({ where: { id } });
    if (!row) throw new NotFoundException('enrollment_not_found');
    return row;
  }

  private async rowsForUser(userId: string): Promise<DeviceEnrollmentEntity[]> {
    return this.enrollments.find({ where: { userId } });
  }

  private dataKey(): string {
    const key = this.config.get<string>('app.enrollmentDataKey') ?? '';
    if (key.length < 16) {
      throw new ServiceUnavailableException('install_unavailable');
    }
    return key;
  }

  private publicBase(): string {
    return (this.config.get<string>('app.publicBaseUrl') ?? '').replace(/\/$/, '');
  }

  private callbackUrl(token: string): string {
    return `${this.publicBase()}/api/v1/device-enrollment/callback/${token}`;
  }

  private toCustomer(row: DeviceEnrollmentEntity): CustomerEnrollment {
    let token: string | null = null;
    if (row.tokenCipher && !row.consumedAt) {
      try {
        token = decryptSecret(row.tokenCipher, this.dataKey());
      } catch {
        token = null;
      }
    }
    const profileUrl = token
      ? `${this.publicBase()}/api/v1/device-enrollment/profile/${token}`
      : null;
    return {
      id: row.id,
      status: row.status,
      signingStatus: row.signingStatus,
      installStrategy: row.installStrategy,
      label: row.label,
      product: row.product,
      iosVersion: row.iosVersion,
      expiresAt: new Date(row.expiresAt).toISOString(),
      failureCode: row.failureCode,
      customerMessage: customerMessage(row.failureCode),
      developerModeRequired:
        developerModeRequired(row.installStrategy) && row.signingStatus === 'READY',
      profileUrl,
      activated: Boolean(row.activatedAt),
    };
  }

  private async productionInstallReady(strategy: InstallStrategy): Promise<boolean> {
    if ((this.config.get<string>('app.nodeEnv') ?? '') !== 'production') return true;
    if (strategy !== 'AD_HOC_SELF_SERVICE' && strategy !== 'USER_SIDE_SIGNING') {
      return true;
    }
    const key = this.config.get<string>('app.enrollmentDataKey') ?? '';
    const callback = this.config.get<string>('app.signingCallbackToken') ?? '';
    const cert = this.config.get<string>('app.profileSigningCert') ?? '';
    const profileKey = this.config.get<string>('app.profileSigningKey') ?? '';
    const trustBundle = this.config.get<string>('app.enrollmentCmsTrustBundlePem') ?? '';
    if (key.length < 16 || !callback.trim() || !cert.trim() || !profileKey.trim()) {
      return false;
    }
    if (!this.diagnosticEnabled() && !trustBundle.includes('BEGIN CERTIFICATE')) {
      return false;
    }
    if (strategy === 'USER_SIDE_SIGNING') return true;
    const dispatch = this.config.get<string>('app.githubDispatchToken') ?? '';
    if (!this.apple.isConfigured() || !dispatch.trim()) return false;
    return (await this.readStablePayload()) !== null;
  }

  private async readStableManifest(): Promise<StableReleaseIdentity | null> {
    if (!(await this.storage.exists(STABLE_MANIFEST))) return null;
    try {
      const parsed = JSON.parse(
        (await this.storage.readBuffer(STABLE_MANIFEST)).toString('utf8'),
      ) as Partial<StableReleaseIdentity>;
      if (
        !parsed.sourceCommit ||
        !parsed.airliftSha ||
        !parsed.appVersion ||
        !parsed.buildNumber ||
        !parsed.unsignedIpaSha256 ||
        !parsed.relativePath ||
        !/^[0-9a-f]{64}$/i.test(parsed.unsignedIpaSha256) ||
        parsed.relativePath.includes('..')
      ) {
        return null;
      }
      return {
        sourceCommit: parsed.sourceCommit,
        airliftSha: parsed.airliftSha,
        appVersion: parsed.appVersion,
        buildNumber: parsed.buildNumber,
        unsignedIpaSha256: parsed.unsignedIpaSha256.toLowerCase(),
        relativePath: parsed.relativePath,
      };
    } catch {
      return null;
    }
  }

  private async readStablePayload(): Promise<{
    identity: StableReleaseIdentity;
    bytes: Buffer;
  } | null> {
    const identity = await this.readStableManifest();
    if (!identity || !(await this.storage.exists(identity.relativePath))) return null;
    const bytes = await this.storage.readBuffer(identity.relativePath);
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (!this.secretsMatch(actual, identity.unsignedIpaSha256)) return null;
    return { identity, bytes };
  }

  private async storedIpaMatches(
    job: SigningJobEntity,
    claimedSha256: string,
  ): Promise<boolean> {
    if (!job.artifactRelativePath || !job.ipaSha256) return false;
    if (!(await this.storage.exists(job.artifactRelativePath))) return false;
    const bytes = await this.storage.readBuffer(job.artifactRelativePath);
    try {
      assertIpaBytes(bytes, this.maxIpaBytes());
    } catch {
      return false;
    }
    const actual = createHash('sha256').update(bytes).digest('hex');
    return (
      this.secretsMatch(actual, job.ipaSha256) &&
      this.secretsMatch(actual, claimedSha256.trim().toLowerCase())
    );
  }

  async cmsDiagnosticForUser(userId: string, id: string) {
    const row = await this.owned(userId, id);
    return this.safeDiagnostic(row.cmsDiagnostic);
  }

  private diagnosticEnabled(): boolean {
    return this.config.get<boolean>('app.enrollmentCmsDiagnostic') === true;
  }

  private async recordCmsDiagnostic(
    session: DeviceEnrollmentEntity,
    body: Buffer,
  ): Promise<void> {
    let signer: SignerCertificateMetadata | null = null;
    let chain: SignerCertificateMetadata[] = [];
    let signatureIntact = false;
    try {
      const inspected = inspectUntrustedCms(body);
      signatureIntact = true;
      signer = inspected.signer;
      chain = inspected.chain;
    } catch {
      signatureIntact = false;
    }
    const record = { signatureIntact, signer, chain };
    session.cmsDiagnostic = JSON.stringify(record);
    session.updatedAt = new Date();
    await this.enrollments.save(session);
    this.note('cms diagnostic', {
      enrollmentId: session.id,
      signatureIntact,
      signerFingerprint: signer?.fingerprintSha256 ?? null,
    });
    await this.record('DEVICE_CMS_DIAGNOSTIC', session.userId, session.id, {
      signatureIntact,
      signerFingerprint: signer?.fingerprintSha256 ?? null,
    });
  }

  private safeDiagnostic(raw: string | null) {
    if (!raw) throw new NotFoundException('cms_diagnostic_missing');
    let parsed: {
      signatureIntact?: boolean;
      signer?: SignerCertificateMetadata | null;
      chain?: SignerCertificateMetadata[];
    };
    try {
      parsed = JSON.parse(raw) as typeof parsed;
    } catch {
      throw new NotFoundException('cms_diagnostic_missing');
    }
    const signer = parsed.signer ? publicCertificate(parsed.signer) : null;
    const chain = Array.isArray(parsed.chain)
      ? parsed.chain.map((item) => publicCertificate(item))
      : [];
    return {
      signatureIntact: parsed.signatureIntact === true,
      signer,
      chain,
    };
  }

  private expectedChallenge(session: DeviceEnrollmentEntity): string | null {
    if (!session.challengeCipher) return null;
    try {
      const value = decryptSecret(session.challengeCipher, this.dataKey());
      return value || null;
    } catch {
      return null;
    }
  }

  private secretsMatch(left: string, right: string): boolean {
    const a = Buffer.from(left);
    const b = Buffer.from(right);
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
  }

  private cleanIdentity(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length > 128 || /[\r\n\0]/.test(trimmed)) {
      throw new BadRequestException('stable_identity_invalid');
    }
    return trimmed;
  }

  private maxIpaBytes(): number {
    const configured = Number(this.config.get('app.signedIpaMaxBytes') ?? 200 * 1024 * 1024);
    return Number.isFinite(configured) && configured > 0 ? configured : 200 * 1024 * 1024;
  }

  private assertCallbackAuth(presented: string): void {
    const expected = this.config.get<string>('app.signingCallbackToken') ?? '';
    const left = Buffer.from(expected);
    const right = Buffer.from(presented || '');
    if (!expected || left.length !== right.length || !timingSafeEqual(left, right)) {
      throw new UnauthorizedException('unauthorized');
    }
  }

  private note(
    event: string,
    fields: Record<string, string | number | boolean | null>,
  ): void {
    for (const key of Object.keys(fields)) {
      const lowered = key.toLowerCase();
      if (lowered.includes('udid') || lowered.includes('challenge')) {
        throw new Error('refusing to record a raw device identifier');
      }
    }
    this.debugLines.push(JSON.stringify({ event, fields }));
  }

  private async record(
    action: string,
    userId: string,
    resourceId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    const safe: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(metadata)) {
      const lowered = key.toLowerCase();
      if (lowered.includes('udid') || lowered.includes('challenge')) continue;
      safe[key] = value;
    }
    await this.auditLog.record({
      action,
      actorUserId: userId,
      actorType: 'system',
      resourceType: 'device_enrollment',
      resourceId,
      metadata: safe,
    });
  }
}
