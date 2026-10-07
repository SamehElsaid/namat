import { createHash, randomBytes } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  NotImplementedException,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { MAX_ACTIVE_INSTALLATIONS } from '@namat/shared';
import { DeviceEntity } from '../../database/entities/device.entity';
import { DeviceChallengeEntity } from '../../database/entities/device-challenge.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { DeviceEnrollmentService } from '../device-enrollment/device-enrollment.service';
import {
  fingerprintP256Point,
  hashNonce,
  parseP256Point,
  verifyP256Signature,
} from './device-proof';
import { verifyAppAttest, type AppAttestConfig } from './app-attest';
import { NotificationsService } from '../notifications/notifications.service';

const TRANSFER_LIMIT = 3;
const TRANSFER_WINDOW_MS = 24 * 60 * 60 * 1000;
const CHALLENGE_TTL_MS = 2 * 60 * 1000;

@Injectable()
export class DevicesService {
  private readonly activationTails = new Map<string, Promise<unknown>>();

  constructor(
    @InjectRepository(DeviceEntity)
    private readonly devices: Repository<DeviceEntity>,
    @InjectRepository(EntitlementEntity)
    private readonly entitlements: Repository<EntitlementEntity>,
    @Optional()
    private readonly enrollment?: DeviceEnrollmentService,
    @Optional()
    private readonly config?: ConfigService,
    @Optional()
    private readonly notifications?: NotificationsService,
  ) {}

  async register(params: {
    userId: string;
    installationId: string;
    appVersion?: string;
    iosVersion?: string;
    installationToken?: string;
    publicKeyPoint?: string;
  }): Promise<DeviceEntity> {
    let wasNew = false;
    const saved = await this.withUserLock(params.userId, () =>
      this.devices.manager.transaction(async (manager) => {
      const devices = manager.getRepository(DeviceEntity);
      const entitlements = manager.getRepository(EntitlementEntity);
      const entitlement = await this.lockEntitlement(manager, entitlements, params.userId);
      if (!entitlement) {
        throw new ForbiddenException('Active entitlement required');
      }
      const key = this.readKey(params.publicKeyPoint);
      const existing = await devices.findOne({
        where: { installationId: params.installationId },
      });
      if (existing) {
        if (existing.userId !== params.userId) {
          throw new ConflictInstallation(
            'Installation ID already registered to another account',
          );
        }
        applyInstallationToken(existing, params.installationToken);
        this.applyKey(existing, key);
        if (existing.status !== 'active') {
          await this.assertRoom(devices, params.userId, entitlement, existing.id);
          existing.status = 'active';
          existing.deactivatedAt = null;
        }
        existing.appVersion = params.appVersion ?? existing.appVersion;
        existing.iosVersion = params.iosVersion ?? existing.iosVersion;
        existing.label = friendlyDeviceLabel(existing.iosVersion);
        existing.lastSeenAt = new Date();
        return devices.save(existing);
      }

      await this.assertRoom(devices, params.userId, entitlement, null);
      const created = devices.create({
        userId: params.userId,
        installationId: params.installationId,
        appVersion: params.appVersion ?? null,
        iosVersion: params.iosVersion ?? null,
        label: friendlyDeviceLabel(params.iosVersion),
        status: 'active',
        lastSeenAt: new Date(),
        installationTokenHash: null,
        publicKeyPoint: key?.point ?? null,
        publicKeyFingerprint: key?.fingerprint ?? null,
      });
      applyInstallationToken(created, params.installationToken);
      wasNew = true;
      return devices.save(created);
    }),
    );
    await this.enrollment?.linkInstallation(params.userId, params.installationId);
    if (wasNew) {
      this.notifications?.emit({
        type: 'NEW_DEVICE',
        userId: params.userId,
        data: { label: saved.label ?? 'iPhone' },
      });
    }
    return saved;
  }

  async beginApplyProof(
    userId: string,
    installationId: string,
  ): Promise<{ challengeId: string; nonce: string }> {
    const device = await this.requireActiveDevice(userId, installationId);
    if (this.config?.get<boolean>('app.requireAppAttest') === true) {
      throw new ForbiddenException({
        error: 'ActivationAttestationRequired',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    if (!device.publicKeyPoint) {
      throw new ForbiddenException({
        error: 'ActivationProofRequired',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    const challenges = this.devices.manager.getRepository(DeviceChallengeEntity);
    const nonce = randomBytes(32).toString('base64url');
    const row = await challenges.save(
      challenges.create({
        deviceId: device.id,
        nonceHash: hashNonce(nonce),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        consumedAt: null,
      }),
    );
    return { challengeId: row.id, nonce };
  }

  async completeApplyProof(
    userId: string,
    challengeId: string,
    nonce: string,
    signature: string,
  ): Promise<{ ok: true }> {
    const challenges = this.devices.manager.getRepository(DeviceChallengeEntity);
    const challenge = await challenges.findOne({ where: { id: challengeId } });
    if (
      !challenge ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      challenge.nonceHash !== hashNonce(nonce)
    ) {
      throw new UnauthorizedException({
        error: 'ActivationProofInvalid',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    const device = await this.devices.findOne({ where: { id: challenge.deviceId } });
    if (
      !device ||
      device.userId !== userId ||
      device.status !== 'active' ||
      !device.publicKeyPoint ||
      !verifyP256Signature(device.publicKeyPoint, nonce, signature)
    ) {
      throw new UnauthorizedException({
        error: 'ActivationProofInvalid',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    challenge.consumedAt = new Date();
    await challenges.save(challenge);
    return { ok: true };
  }

  private appAttestEnabled(): boolean {
    return this.config?.get<boolean>('app.requireAppAttest') === true;
  }

  private appAttestConfig(): AppAttestConfig {
    return {
      teamId: this.config?.get<string>('app.appAttestTeamId') ?? '',
      bundleId: this.config?.get<string>('app.appAttestBundleId') ?? '',
      rootCertsPem: splitPemBundle(this.config?.get<string>('app.appAttestRootCaPem') ?? ''),
      allowDevelopment: this.config?.get<boolean>('app.appAttestAllowDevelopment') === true,
    };
  }

  /**
   * Issue a one-time attestation challenge for a registered device. The raw
   * challenge is returned to the app (which hashes it as clientDataHash); only
   * its hash is stored, so a challenge cannot be replayed or forged.
   */
  async beginAttestation(
    userId: string,
    installationId: string,
  ): Promise<{ challengeId: string; challenge: string }> {
    if (!this.appAttestEnabled()) {
      throw new NotImplementedException({
        error: 'AppAttestUnavailable',
        message: 'Device attestation is not available for this build.',
      });
    }
    const device = await this.requireActiveDevice(userId, installationId);
    const challenges = this.devices.manager.getRepository(DeviceChallengeEntity);
    const challenge = randomBytes(32).toString('base64');
    const row = await challenges.save(
      challenges.create({
        deviceId: device.id,
        nonceHash: hashNonce(challenge),
        expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        consumedAt: null,
      }),
    );
    return { challengeId: row.id, challenge };
  }

  /**
   * Verify an App Attest attestation against the issued challenge and, on
   * success, record the attested key on the device. Fails closed: any
   * verification failure consumes the challenge and rejects.
   */
  async submitAttestation(input: {
    userId: string;
    installationId: string;
    challengeId: string;
    challenge: string;
    keyId: string;
    attestationObject: string;
  }): Promise<{ ok: true; environment: string }> {
    if (!this.appAttestEnabled()) {
      throw new NotImplementedException({
        error: 'AppAttestUnavailable',
        message: 'Device attestation is not available for this build.',
      });
    }
    const device = await this.requireActiveDevice(input.userId, input.installationId);
    const challenges = this.devices.manager.getRepository(DeviceChallengeEntity);
    const challenge = await challenges.findOne({ where: { id: input.challengeId } });
    const rejected = new UnauthorizedException({
      error: 'AppAttestInvalid',
      message: 'Device attestation could not be verified.',
    });
    if (
      !challenge ||
      challenge.deviceId !== device.id ||
      challenge.consumedAt ||
      challenge.expiresAt < new Date() ||
      challenge.nonceHash !== hashNonce(input.challenge)
    ) {
      throw rejected;
    }
    challenge.consumedAt = new Date();
    await challenges.save(challenge);

    const result = verifyAppAttest(
      {
        keyId: input.keyId,
        attestationObject: input.attestationObject,
        challenge: Buffer.from(input.challenge, 'base64'),
      },
      this.appAttestConfig(),
    );
    if (!result.ok) throw rejected;

    device.appAttestKeyId = result.keyId;
    device.appAttestEnv = result.environment;
    device.attestedAt = new Date();
    await this.devices.save(device);
    return { ok: true, environment: result.environment };
  }

  /**
   * Account recovery: revoke every active installation so the next iPhone
   * can activate. Limited to three transfers in 24 hours.
   */
  async transfer(userId: string): Promise<{ ok: true; revoked: number }> {
    const since = new Date(Date.now() - TRANSFER_WINDOW_MS);
    const recent = await this.devices
      .createQueryBuilder('device')
      .where('device.userId = :userId', { userId })
      .andWhere('device.deactivatedAt IS NOT NULL')
      .andWhere('device.deactivatedAt > :since', { since })
      .getCount();
    if (recent >= TRANSFER_LIMIT) {
      throw new BadRequestException({
        error: 'DeviceTransferLimited',
        message: 'Device transfer is temporarily unavailable. Try again later.',
      });
    }
    const active = await this.devices.find({
      where: { userId, status: 'active' },
    });
    const now = new Date();
    for (const device of active) {
      device.status = 'inactive';
      device.deactivatedAt = now;
      await this.devices.save(device);
      await this.enrollment?.deactivateByInstallation(userId, device.installationId);
    }
    return { ok: true, revoked: active.length };
  }

  async rename(userId: string, deviceId: string, label: string): Promise<DeviceEntity> {
    const device = await this.devices.findOne({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');
    const clean = label.trim().slice(0, 64);
    if (!clean) throw new BadRequestException('Label is required');
    device.label = clean;
    return this.devices.save(device);
  }

  async deactivate(userId: string, deviceId: string): Promise<DeviceEntity> {
    const device = await this.devices.findOne({
      where: { id: deviceId, userId },
    });
    if (!device) throw new NotFoundException('Device not found');
    device.status = 'inactive';
    device.deactivatedAt = new Date();
    const saved = await this.devices.save(device);
    await this.enrollment?.deactivateByInstallation(userId, device.installationId);
    this.notifications?.emit({
      type: 'DEVICE_REMOVED',
      userId,
      data: { label: saved.label ?? 'iPhone' },
    });
    return saved;
  }

  async listForUser(userId: string): Promise<DeviceEntity[]> {
    return this.devices.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async listAll(): Promise<DeviceEntity[]> {
    return this.devices.find({ order: { lastSeenAt: 'DESC', createdAt: 'DESC' } });
  }

  private async lockEntitlement(
    manager: EntityManager,
    entitlements: Repository<EntitlementEntity>,
    userId: string,
  ): Promise<EntitlementEntity | null> {
    const postgres = manager.connection.options.type === 'postgres';
    return entitlements.findOne({
      where: { userId, status: 'active' },
      lock: postgres ? { mode: 'pessimistic_write' } : undefined,
    });
  }

  private async assertRoom(
    devices: Repository<DeviceEntity>,
    userId: string,
    entitlement: EntitlementEntity,
    exceptId: string | null,
  ): Promise<void> {
    const active = await devices.find({ where: { userId, status: 'active' } });
    const others = active.filter((device) => device.id !== exceptId);
    const max = entitlement.maxDevices ?? MAX_ACTIVE_INSTALLATIONS;
    if (others.length >= max) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'DeviceLimitExceeded',
        message: `Maximum of ${max} active installations allowed. Deactivate a device first.`,
        maxDevices: max,
        activeDevices: others.length,
      });
    }
  }

  private readKey(
    encoded: string | undefined,
  ): { point: string; fingerprint: string } | null {
    if (!encoded) return null;
    parseP256Point(encoded);
    return { point: encoded.trim(), fingerprint: fingerprintP256Point(encoded) };
  }

  private applyKey(
    device: DeviceEntity,
    key: { point: string; fingerprint: string } | null,
  ): void {
    if (!key) return;
    if (device.publicKeyFingerprint && device.publicKeyFingerprint !== key.fingerprint) {
      throw new ForbiddenException({
        error: 'DeviceKeyMismatch',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    device.publicKeyPoint = key.point;
    device.publicKeyFingerprint = key.fingerprint;
  }

  private async requireActiveDevice(
    userId: string,
    installationId: string,
  ): Promise<DeviceEntity> {
    const device = await this.devices.findOne({ where: { installationId } });
    if (!device || device.userId !== userId || device.status !== 'active') {
      throw new ForbiddenException({
        error: 'ActivationRequired',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    const entitlement = await this.entitlements.findOne({
      where: { userId, status: 'active' },
    });
    if (!entitlement) {
      throw new ForbiddenException({
        error: 'ActivationRequired',
        message: 'This iPhone is not activated for NAMAT.',
      });
    }
    return device;
  }

  private async withUserLock<T>(userId: string, fn: () => Promise<T>): Promise<T> {
    const previous = this.activationTails.get(userId) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tail = previous.then(() => gate, () => gate);
    this.activationTails.set(userId, tail);
    await previous.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.activationTails.get(userId) === tail) {
        this.activationTails.delete(userId);
      }
    }
  }
}

export function presentDevice(device: DeviceEntity) {
  return {
    id: device.id,
    userId: device.userId,
    installationId: device.installationId,
    label: device.label,
    appVersion: device.appVersion,
    iosVersion: device.iosVersion,
    status: device.status,
    lastSeenAt: device.lastSeenAt,
    deactivatedAt: device.deactivatedAt,
    createdAt: device.createdAt,
  };
}

export function friendlyDeviceLabel(iosVersion?: string | null): string {
  if (iosVersion && iosVersion.trim()) {
    return `iPhone · iOS ${iosVersion.trim()}`;
  }
  return 'iPhone';
}

function applyInstallationToken(
  device: DeviceEntity,
  installationToken: string | undefined,
): void {
  const presented = installationToken?.trim();
  if (device.installationTokenHash) {
    if (!presented) {
      throw new ForbiddenException('Installation token required');
    }
    if (hashInstallationToken(presented) !== device.installationTokenHash) {
      throw new ForbiddenException('Installation token does not match');
    }
    return;
  }
  if (presented) {
    device.installationTokenHash = hashInstallationToken(presented);
  }
}

function hashInstallationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Split a PEM bundle (one or more certificates) into individual PEM strings. */
function splitPemBundle(bundle: string): string[] {
  const matches = bundle.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
  return matches ?? [];
}

class ConflictInstallation extends BadRequestException {
  constructor(message: string) {
    super(message);
  }
}
