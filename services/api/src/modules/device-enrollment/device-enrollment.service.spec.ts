import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceEnrollmentEntity } from '../../database/entities/device-enrollment.entity';
import { DeviceEntity } from '../../database/entities/device.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import {
  SigningJobEntity,
  SigningLockEntity,
} from '../../database/entities/signing-job.entity';
import { LocalFileStorage } from '../../storage/local-file.storage';
import { AuditService } from '../audit/audit.service';
import { AppleProvisioningError } from './apple-provisioning';
import { DeviceCmsFixture } from './cms-test-fixture';
import {
  APPLE_PROVISIONING,
  DeviceEnrollmentService,
  SIGNING_DISPATCHER,
} from './device-enrollment.service';
import { fingerprintIdentifier } from './udid-crypto';

const UDID = '00008020-001A2B3C4D5E6F78';
const CALLBACK_SECRET = 'callback-secret-value';

function memory<T extends { id: string }>() {
  const rows: T[] = [];
  return {
    rows,
    create: (value: T) => value,
    save: async (value: T) => {
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value;
      else rows.push(value);
      return value;
    },
    find: async (opts?: { where?: Partial<T> }) => rows.filter((row) => matches(row, opts?.where)),
    findOne: async (opts?: { where?: Partial<T> }) =>
      rows.find((row) => matches(row, opts?.where)) ?? null,
  };
}

/** Equality filter, matching how the service queries TypeORM. */
function matches<T>(row: T, where?: Partial<T>): boolean {
  if (!where) return true;
  return Object.entries(where).every(
    ([key, value]) => (row as Record<string, unknown>)[key] === value,
  );
}

function fakeIpa(): Buffer {
  return Buffer.concat([
    Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    Buffer.from('Payload/Namat.app/Info.plist'),
    Buffer.alloc(64, 1),
  ]);
}

function deviceXml(challenge: string, udid = UDID): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>UDID</key><string>${udid}</string>
<key>PRODUCT</key><string>iPhone15,2</string>
<key>VERSION</key><string>17.5</string>
<key>CHALLENGE</key><string>${challenge}</string>
<key>IMEI</key><string>999999999999999</string>
</dict></plist>`;
}

describe('DeviceEnrollmentService', () => {
  const configValues: Record<string, string | number | boolean> = {
    'app.enrollmentDataKey': 'test-enrollment-key-32',
    'app.enrollmentTtlSeconds': 900,
    'app.publicBaseUrl': 'https://namat.test',
    'app.nodeEnv': 'test',
    'app.installStrategy': 'AD_HOC_SELF_SERVICE',
    'app.profileSigningCert': '',
    'app.profileSigningKey': '',
    'app.signingCallbackToken': CALLBACK_SECRET,
    'app.githubDispatchToken': '',
    'app.signedIpaMaxBytes': 200 * 1024 * 1024,
    'app.enrollmentCmsTrustBundlePem': '',
    'app.enrollmentAllowLegacyIphoneDeviceCa': false,
    'app.enrollmentCmsDiagnostic': false,
    'app.stableSourceCommit': 'abc123',
    'app.stableAirliftSha': 'airliftsha',
    'app.stableAppVersion': '1.2.0',
    'app.stableBuildNumber': '10',
    'app.appleAdHocDeviceLimit': 100,
  };

  const files = new Map<string, Buffer>();
  const storage = {
    async writeBuffer(relativePath: string, data: Buffer) {
      if (relativePath.includes('..')) throw new Error('Invalid storage path');
      files.set(relativePath, Buffer.from(data));
      return {
        relativePath,
        absolutePath: relativePath,
        contentHash: createHash('sha256').update(data).digest('hex'),
        byteSize: data.length,
        mimeType: 'application/octet-stream',
      };
    },
    async exists(relativePath: string) {
      return files.has(relativePath);
    },
    async readBuffer(relativePath: string) {
      const found = files.get(relativePath);
      if (!found) throw new Error('missing');
      return found;
    },
    resolveInsideRoot(relativePath: string) {
      if (relativePath.includes('..') || relativePath.includes('\0')) {
        throw new Error('Invalid storage path');
      }
      return relativePath;
    },
  };

  let fixture: DeviceCmsFixture;
  let service: DeviceEnrollmentService;
  let enrollments: ReturnType<typeof memory<DeviceEnrollmentEntity>>;
  let jobs: ReturnType<typeof memory<SigningJobEntity>>;
  let locks: ReturnType<typeof memory<SigningLockEntity>>;
  let entitlements: ReturnType<typeof memory<EntitlementEntity>>;
  let devices: ReturnType<typeof memory<DeviceEntity>>;
  let audits: Array<{ action: string; metadata?: Record<string, unknown> | null }>;
  let apple: {
    configured: boolean;
    remaining: number;
    failCode: string | null;
    registrations: Array<{ udid: string }>;
    profiles: string[][];
    isConfigured: () => boolean;
    registerDevice: (input: { udid: string; name: string }) => Promise<{
      appleDeviceId: string;
      alreadyRegistered: boolean;
    }>;
    capacity: () => Promise<{
      registeredIphoneCount: number;
      limit: number;
      remaining: number;
    }>;
    regenerateProfile: (ids: string[]) => Promise<{
      profileId: string;
      profileContentBase64: string;
    }>;
  };
  let dispatchAccepted: boolean;

  beforeAll(() => {
    fixture = new DeviceCmsFixture();
  });

  afterAll(() => fixture.dispose());

  beforeEach(async () => {
    configValues['app.installStrategy'] = 'AD_HOC_SELF_SERVICE';
    configValues['app.stableSourceCommit'] = 'abc123';
    configValues['app.nodeEnv'] = 'test';
    configValues['app.enrollmentCmsTrustBundlePem'] = fixture.caPem;
    configValues['app.enrollmentAllowLegacyIphoneDeviceCa'] = false;
    configValues['app.enrollmentCmsDiagnostic'] = false;
    configValues['app.profileSigningCert'] = '';
    configValues['app.profileSigningKey'] = '';
    configValues['app.githubDispatchToken'] = '';
    files.clear();
    enrollments = memory();
    jobs = memory();
    locks = memory();
    entitlements = memory();
    devices = memory();
    audits = [];
    dispatchAccepted = true;
    entitlements.rows.push({
      id: 'ent-1',
      userId: 'user-1',
      status: 'active',
      maxDevices: 1,
    } as EntitlementEntity);

    apple = {
      configured: true,
      remaining: 100,
      failCode: null,
      registrations: [],
      profiles: [],
      isConfigured() {
        return this.configured;
      },
      async registerDevice(input) {
        if (this.failCode) throw new AppleProvisioningError(this.failCode);
        const existing = this.registrations.find(
          (row) => row.udid.toUpperCase() === input.udid.toUpperCase(),
        );
        if (existing) {
          return { appleDeviceId: 'apple-existing', alreadyRegistered: true };
        }
        this.registrations.push({ udid: input.udid });
        return {
          appleDeviceId: `apple-${this.registrations.length}`,
          alreadyRegistered: false,
        };
      },
      async capacity() {
        return {
          registeredIphoneCount: this.registrations.length,
          limit: 100,
          remaining: Math.max(0, this.remaining - this.registrations.length),
        };
      },
      async regenerateProfile(ids) {
        this.profiles.push(ids);
        return {
          profileId: `prof-${this.profiles.length}`,
          profileContentBase64: Buffer.from('profile-bytes').toString('base64'),
        };
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        DeviceEnrollmentService,
        { provide: getRepositoryToken(DeviceEnrollmentEntity), useValue: enrollments },
        { provide: getRepositoryToken(SigningJobEntity), useValue: jobs },
        { provide: getRepositoryToken(SigningLockEntity), useValue: locks },
        { provide: getRepositoryToken(EntitlementEntity), useValue: entitlements },
        { provide: getRepositoryToken(DeviceEntity), useValue: devices },
        {
          provide: AuditService,
          useValue: {
            record: jest.fn(async (input) => {
              audits.push(input);
              return input;
            }),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: (key: string) => configValues[key] },
        },
        { provide: LocalFileStorage, useValue: storage },
        { provide: APPLE_PROVISIONING, useValue: apple },
        {
          provide: SIGNING_DISPATCHER,
          useValue: {
            dispatch: jest.fn(async () => ({ accepted: dispatchAccepted })),
          },
        },
      ],
    }).compile();

    service = moduleRef.get(DeviceEnrollmentService);
  });

  function assertNoRawIdentifier(extraSecret = '') {
    const blob = JSON.stringify({ lines: service.debugLines, audits });
    expect(blob).not.toContain(UDID);
    expect(blob.toLowerCase()).not.toContain(UDID.toLowerCase());
    if (extraSecret) expect(blob).not.toContain(extraSecret);
  }

  async function signedFor(created: { profileUrl: string | null }, udid = UDID) {
    const token = created.profileUrl!.split('/').pop()!;
    const profile = await service.profileBody(token);
    const xml = Buffer.isBuffer(profile) ? profile.toString('utf8') : profile;
    const match = xml.match(/<key>Challenge<\/key>\s*<string>([^<]*)<\/string>/);
    if (!match?.[1]) throw new Error('profile is missing a challenge');
    return {
      token,
      challenge: match[1],
      body: fixture.sign(deviceXml(match[1], udid)),
    };
  }

  async function registerDevice(created: { profileUrl: string | null }, udid = UDID) {
    const signed = await signedFor(created, udid);
    await service.completeCallback(
      signed.token,
      signed.body,
      'application/pkcs7-signature',
    );
    return signed;
  }

  function signingJob() {
    const job = [...jobs.rows].reverse().find((row) => row.status === 'SIGNING');
    if (!job) throw new Error('expected a signing job');
    return job;
  }

  async function storeIpa(sha?: string) {
    const ipa = fakeIpa();
    const digest = sha ?? createHash('sha256').update(ipa).digest('hex');
    const job = signingJob();
    const stored = await service.storeSignedIpa(job.id, CALLBACK_SECRET, ipa, digest);
    return { ipa, digest, job, stored };
  }

  async function markStoredReady() {
    const stored = await storeIpa();
    await service.completeSigningJob(stored.job.id, CALLBACK_SECRET, {
      ipaSha256: stored.digest,
      profileIdentifier: stored.job.profileIdentifier ?? 'prof-1',
      appVersion: '1.2.0',
      buildNumber: '10',
      sourceCommit: 'abc123',
      airliftSha: 'airliftsha',
    });
    return stored;
  }

  it('requires an active entitlement', async () => {
    entitlements.rows.length = 0;
    await expect(service.start('user-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates an enrollment session with a tokenized profile URL and a challenge', async () => {
    const created = await service.start('user-1');
    expect(created.status).toBe('DISCOVERED');
    expect(created.profileUrl).toMatch(
      /^https:\/\/namat\.test\/api\/v1\/device-enrollment\/profile\//,
    );
    expect(new Date(created.expiresAt).getTime()).toBeGreaterThan(Date.now());
    const signed = await signedFor(created);
    expect(signed.challenge.length).toBeGreaterThan(20);
    expect(created.profileUrl).not.toContain(UDID);
    expect(service.debugLines.join('\n')).not.toContain(signed.challenge);
    expect(audits.map((row) => row.action)).toContain('DEVICE_ENROLLMENT_STARTED');
    assertNoRawIdentifier(signed.challenge);
  });

  it('rejects an expired enrollment token', async () => {
    const created = await service.start('user-1');
    enrollments.rows[0].expiresAt = new Date(Date.now() - 1000);
    const token = created.profileUrl!.split('/').pop()!;
    await expect(
      service.completeCallback(token, Buffer.from('expired'), 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(GoneException);
    expect(enrollments.rows[0].status).toBe('EXPIRED');
  });

  it('rejects a replayed enrollment token', async () => {
    const created = await service.start('user-1');
    const signed = await registerDevice(created);
    await expect(
      service.completeCallback(signed.token, signed.body, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.rows[0].failureCode).toBe('replay');
  });

  it('links the device to the customer that started enrollment', async () => {
    const created = await service.start('user-1');
    const signed = await registerDevice(created);
    expect(enrollments.rows[0].userId).toBe('user-1');
    expect(enrollments.rows[0].product).toBe('iPhone15,2');
    expect(enrollments.rows[0].iosVersion).toBe('17.5');
    expect(enrollments.rows[0].udidCipher).toBeTruthy();
    expect(enrollments.rows[0].udidCipher).not.toContain(UDID);
    assertNoRawIdentifier(signed.challenge);
  });

  it('enforces one active NAMAT installation', async () => {
    devices.rows.push(
      { id: 'd1', userId: 'user-1', status: 'active' } as DeviceEntity,
    );
    await expect(service.start('user-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('does not register the same device with Apple twice or copy a ready install', async () => {
    const first = await service.start('user-1');
    await registerDevice(first);
    const second = await service.start('user-1');
    await registerDevice(second);
    expect(apple.registrations).toHaveLength(1);
    expect(enrollments.rows[1].status).not.toBe('INSTALL_READY');
    expect(enrollments.rows[1].signingStatus).toBe('SIGNING');
  });

  it('records Apple registration failure without a raw identifier', async () => {
    apple.failCode = 'apple_register_failed';
    const created = await service.start('user-1');
    const signed = await registerDevice(created);
    expect(enrollments.rows[0].failureCode).toBe('apple_register_failed');
    expect(enrollments.rows[0].signingStatus).toBe('FAILED');
    assertNoRawIdentifier(signed.challenge);
  });

  it('keeps signing in progress until the stored IPA checksum matches', async () => {
    const created = await service.start('user-1');
    const signed = await registerDevice(created);
    expect(apple.profiles[0]).toEqual(['apple-1']);
    expect(jobs.rows[0].mode).toBe('RESIGN');
    expect(jobs.rows[0].status).toBe('SIGNING');
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');
    const states = service.debugLines
      .map((line) => JSON.parse(line) as { event: string; fields: { status?: string } })
      .filter((line) => line.event === 'signing state')
      .map((line) => line.fields.status);
    expect(states).toEqual(['REGISTERING_DEVICE', 'GENERATING_PROFILE', 'SIGNING']);

    await expect(
      service.completeSigningJob(jobs.rows[0].id, CALLBACK_SECRET, {
        ipaSha256: 'a'.repeat(64),
        profileIdentifier: 'prof-1',
        appVersion: '1.2.0',
        buildNumber: '10',
        sourceCommit: 'abc123',
        airliftSha: 'airliftsha',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');

    await expect(
      service.storeSignedIpa(jobs.rows[0].id, CALLBACK_SECRET, fakeIpa(), 'b'.repeat(64)),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(files.size).toBe(0);

    const stored = await markStoredReady();
    expect(jobs.rows[0].status).toBe('READY');
    expect(enrollments.rows[0].status).toBe('INSTALL_READY');
    expect(jobs.rows[0].artifactRelativePath).toBe(stored.stored.artifactRelativePath);
    expect(files.get(stored.stored.artifactRelativePath)?.equals(stored.ipa)).toBe(true);
    const readyStates = service.debugLines
      .map((line) => JSON.parse(line) as { event: string; fields: { status?: string } })
      .filter((line) => line.event === 'signing state')
      .map((line) => line.fields.status);
    expect(readyStates).toContain('READY');
    expect(audits.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        'DEVICE_REGISTERED',
        'APPLE_DEVICE_REGISTERED',
        'SIGNING_STARTED',
        'SIGNING_COMPLETED',
      ]),
    );
    assertNoRawIdentifier(signed.challenge);
  });

  it('rejects a completion checksum that does not match the stored IPA', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    await storeIpa();
    await expect(
      service.completeSigningJob(signingJob().id, CALLBACK_SECRET, {
        ipaSha256: 'c'.repeat(64),
        profileIdentifier: 'prof-1',
        appVersion: '1.2.0',
        buildNumber: '10',
        sourceCommit: 'abc123',
        airliftSha: 'airliftsha',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');
    expect(signingJob().status).toBe('SIGNING');
  });

  it('does not become ready when the stored IPA disappears before completion', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    const stored = await storeIpa();
    files.delete(stored.stored.artifactRelativePath);
    await expect(
      service.completeSigningJob(stored.job.id, CALLBACK_SECRET, {
        ipaSha256: stored.digest,
        profileIdentifier: 'prof-1',
        appVersion: '1.2.0',
        buildNumber: '10',
        sourceCommit: 'abc123',
        airliftSha: 'airliftsha',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');
  });

  it('keeps a second registration queued while the signing lock is held, then retries', async () => {
    await locks.save(
      locks.create({
        id: 'ad-hoc',
        ownerJobId: 'other-job',
        lockedUntil: new Date(Date.now() + 60_000),
      } as SigningLockEntity),
    );
    const created = await service.start('user-1');
    await registerDevice(created);
    expect(enrollments.rows[0].signingStatus).toBe('QUEUED');
    expect(apple.registrations).toHaveLength(0);

    locks.rows[0].ownerJobId = null;
    locks.rows[0].lockedUntil = null;
    await service.retrySigning(created.id);
    expect(apple.registrations).toHaveLength(1);
    expect(apple.profiles).toHaveLength(1);
    expect(enrollments.rows[0].signingStatus).toBe('SIGNING');
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');
  });

  it('rejects an unknown callback and a JSON UDID form', async () => {
    await expect(
      service.completeCallback('missing-token', Buffer.from('nope'), 'application/xml'),
    ).rejects.toBeInstanceOf(NotFoundException);
    const created = await service.start('user-1');
    await expect(
      service.completeCallback(
        created.profileUrl!.split('/').pop()!,
        Buffer.from(JSON.stringify({ udid: UDID })),
        'application/json',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].udidCipher).toBeNull();
    expect(enrollments.rows[0].consumedAt).toBeNull();
  });

  it('rejects a forged raw UDID plist and a wrong challenge without consuming the session', async () => {
    const created = await service.start('user-1');
    const signed = await signedFor(created);
    const raw = Buffer.from(deviceXml(signed.challenge));
    await expect(
      service.completeCallback(signed.token, raw, 'application/xml'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].consumedAt).toBeNull();

    const wrong = fixture.sign(deviceXml('wrong-challenge-value'));
    await expect(
      service.completeCallback(signed.token, wrong, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].consumedAt).toBeNull();

    const tampered = Buffer.from(signed.body);
    tampered[tampered.length - 2] ^= 0xff;
    await expect(
      service.completeCallback(signed.token, tampered, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].consumedAt).toBeNull();

    await service.completeCallback(
      signed.token,
      signed.body,
      'application/pkcs7-signature',
    );
    expect(enrollments.rows[0].consumedAt).toBeTruthy();
    assertNoRawIdentifier(signed.challenge);
  });

  it('fails closed in production without a trust bundle and accepts the configured bundle', async () => {
    const created = await service.start('user-1');
    const signed = await signedFor(created);
    configValues['app.nodeEnv'] = 'production';
    configValues['app.enrollmentCmsTrustBundlePem'] = '';
    configValues['app.enrollmentAllowLegacyIphoneDeviceCa'] = true;
    await expect(
      service.completeCallback(signed.token, signed.body, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].consumedAt).toBeNull();
    expect(enrollments.rows[0].udidCipher).toBeNull();

    configValues['app.enrollmentCmsTrustBundlePem'] = fixture.signWithUntrustedCa(
      deviceXml('other'),
    ).toString('utf8');
    await expect(
      service.completeCallback(signed.token, signed.body, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].consumedAt).toBeNull();

    configValues['app.enrollmentAllowLegacyIphoneDeviceCa'] = false;
    configValues['app.enrollmentCmsTrustBundlePem'] = fixture.caPem;
    await service.completeCallback(
      signed.token,
      signed.body,
      'application/pkcs7-signature',
    );
    expect(enrollments.rows[0].consumedAt).toBeTruthy();
    expect(enrollments.rows[0].status).not.toBe('INSTALL_READY');
  });

  it('records signer metadata in diagnostic mode without enrolling or exposing the identifier', async () => {
    configValues['app.enrollmentCmsDiagnostic'] = true;
    const created = await service.start('user-1');
    const signed = await signedFor(created);
    await expect(
      service.completeCallback(signed.token, signed.body, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(enrollments.rows[0].status).toBe('DISCOVERED');
    expect(enrollments.rows[0].consumedAt).toBeNull();
    expect(enrollments.rows[0].udidCipher).toBeNull();
    expect(apple.registrations).toHaveLength(0);
    expect(jobs.rows).toHaveLength(0);
    const diagnostic = await service.cmsDiagnosticForUser('user-1', created.id);
    const encoded = JSON.stringify({ diagnostic, lines: service.debugLines, audits });
    expect(diagnostic.signatureIntact).toBe(true);
    expect(diagnostic.signer?.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(diagnostic.signer?.issuer).toContain('Test Device CA');
    expect(encoded).not.toContain(UDID);
    expect(encoded).not.toContain(signed.challenge);
    expect(encoded).not.toContain('<plist');
    await expect(service.cmsDiagnosticForUser('user-2', created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('rejects a device already linked to another customer', async () => {
    enrollments.rows.push({
      id: 'other',
      userId: 'user-2',
      tokenHash: 'other-hash',
      status: 'INSTALL_READY',
      udidFingerprint: fingerprintIdentifier(UDID),
      deactivatedAt: null,
    } as DeviceEnrollmentEntity);
    const created = await service.start('user-1');
    const signed = await signedFor(created);
    await expect(
      service.completeCallback(signed.token, signed.body, 'application/pkcs7-signature'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(enrollments.rows.find((row) => row.userId === 'user-1')?.failureCode).toBe(
      'device_owned_by_another_account',
    );
  });

  it('does not reveal another customer enrollment', async () => {
    const created = await service.start('user-1');
    await expect(service.getForUser('user-2', created.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('fails closed when signing cannot be dispatched', async () => {
    dispatchAccepted = false;
    const created = await service.start('user-1');
    await registerDevice(created);
    const view = await service.getForUser('user-1', created.id);
    expect(view.customerMessage).toBe(
      'Installation is currently unavailable. Your purchase stays active.',
    );
    expect(view.customerMessage).not.toMatch(/github|udid|certificate/i);
  });

  it('reports exhausted Apple capacity without starting a profile', async () => {
    apple.remaining = 0;
    const created = await service.start('user-1');
    expect(created.installStrategy).toBe('UNAVAILABLE');
    expect(created.profileUrl).toBeNull();
    expect(created.failureCode).toBe('capacity_exhausted');
    expect(created.customerMessage).toMatch(/capacity is full/);
    const capacity = await service.adminCapacity();
    expect(capacity.remaining).toBe(0);
    expect(capacity.registrationFailures).toBeGreaterThan(0);
  });

  it('fails closed in production when the stable payload or signing material is missing', async () => {
    configValues['app.nodeEnv'] = 'production';
    const blocked = await service.start('user-1');
    expect(blocked.profileUrl).toBeNull();
    expect(blocked.failureCode).toBe('install_unavailable');

    configValues['app.nodeEnv'] = 'test';
    const ipa = fakeIpa();
    const published = await service.publishStablePayload(ipa, {
      sourceCommit: 'abc123',
      airliftSha: 'airliftsha',
      appVersion: '1.2.0',
      buildNumber: '10',
    });
    expect(published.unsignedIpaSha256).toHaveLength(64);
    const loaded = await service.stablePayload(CALLBACK_SECRET, published.unsignedIpaSha256);
    expect(loaded.equals(ipa)).toBe(true);
    await expect(
      service.stablePayload(CALLBACK_SECRET, 'd'.repeat(64)),
    ).rejects.toBeInstanceOf(ConflictException);

    configValues['app.nodeEnv'] = 'production';
    configValues['app.githubDispatchToken'] = 'dispatch-token';
    configValues['app.profileSigningCert'] = fixture.caPem;
    configValues['app.profileSigningKey'] = readFileSync(
      `${fixture.directory}/ca.key`,
      'utf8',
    );
    configValues['app.enrollmentCmsTrustBundlePem'] = '';
    const missingTrust = await service.start('user-1');
    expect(missingTrust.profileUrl).toBeNull();
    expect(missingTrust.failureCode).toBe('install_unavailable');
    configValues['app.enrollmentCmsTrustBundlePem'] = fixture.caPem;
    const created = await service.start('user-1');
    expect(created.profileUrl).toBeTruthy();
    const body = await service.profileBody(created.profileUrl!.split('/').pop()!);
    expect(Buffer.isBuffer(body)).toBe(true);
  });

  it('admin output uses a fingerprint prefix and omits the identifier', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    const listed = await service.adminList();
    expect(listed[0].fingerprintPrefix).toHaveLength(8);
    expect(JSON.stringify(listed)).not.toContain(UDID);
    expect(JSON.stringify(listed)).not.toContain('udidCipher');
    const full = createHash('sha256').update(UDID.toUpperCase()).digest('hex');
    expect(JSON.stringify(listed)).not.toContain(full);
  });

  it('serves the install manifest and the stored IPA only after verification', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    await expect(service.issueInstallLink('user-1', created.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    const stored = await markStoredReady();
    const link = await service.issueInstallLink('user-1', created.id);
    expect(link.installUrl.startsWith('itms-services://?action=download-manifest&url=')).toBe(
      true,
    );
    const token = link.manifestUrl.split('/').pop()!;
    const xml = await service.manifestForToken(token);
    expect(xml).toContain('sa.shara.namat.app');
    expect(xml).not.toContain(UDID);
    const relative = await service.ipaRelativePath(token);
    expect(relative).toBe(stored.stored.artifactRelativePath);
    expect(files.get(relative)?.equals(stored.ipa)).toBe(true);
    const view = await service.getForUser('user-1', created.id);
    expect(view.developerModeRequired).toBe(true);
  });

  it('stops install links after the entitlement is revoked', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    await markStoredReady();
    const link = await service.issueInstallLink('user-1', created.id);
    const token = link.manifestUrl.split('/').pop()!;
    entitlements.rows[0].status = 'revoked';
    await expect(service.manifestForToken(token)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.ipaRelativePath(token)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.issueInstallLink('user-1', created.id)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('stops an issued install link once the device is deactivated', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    await markStoredReady();
    const link = await service.issueInstallLink('user-1', created.id);
    const token = link.manifestUrl.split('/').pop()!;
    enrollments.rows[0].deactivatedAt = new Date();
    await expect(service.ipaRelativePath(token)).rejects.toBeInstanceOf(GoneException);
  });

  it('marks a signing job failed from the workflow callback', async () => {
    const created = await service.start('user-1');
    await registerDevice(created);
    await service.failSigningJob(signingJob().id, CALLBACK_SECRET);
    expect(jobs.rows[0].status).toBe('FAILED');
    expect(enrollments.rows[0].failureCode).toBe('signing_failed');
    const view = await service.getForUser('user-1', created.id);
    expect(view.customerMessage).not.toMatch(/certificate|udid|openssl/i);
    assertNoRawIdentifier();
  });

  it('rejects an unauthorized signing callback', async () => {
    await expect(
      service.completeSigningJob('missing', 'wrong', {
        ipaSha256: 'abc',
        profileIdentifier: 'p',
        appVersion: '1',
        buildNumber: '1',
        sourceCommit: 'abc',
        airliftSha: 'def',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      service.storeSignedIpa('missing', 'wrong', fakeIpa(), 'a'.repeat(64)),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('chooses a full rebuild when no stable Release identity is configured', async () => {
    configValues['app.stableSourceCommit'] = '';
    const created = await service.start('user-1');
    await registerDevice(created);
    expect(jobs.rows[0].mode).toBe('FULL_REBUILD');
  });

  it('activates the NAMAT installation without using the hardware identifier', async () => {
    const created = await service.start('user-1');
    const signed = await registerDevice(created);
    await markStoredReady();
    await service.linkInstallation('user-1', 'install-abc');
    expect(enrollments.rows[0].namatInstallationId).toBe('install-abc');
    expect(audits.map((row) => row.action)).toContain('INSTALLATION_ACTIVATED');
    await service.deactivate(created.id, 'user-1');
    expect(enrollments.rows[0].deactivatedAt).toBeTruthy();
    expect(audits.map((row) => row.action)).toContain('DEVICE_DEACTIVATED');
    assertNoRawIdentifier(signed.challenge);
  });
});
