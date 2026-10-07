import { UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../../database/entities';
import { DeviceEntity } from '../../database/entities/device.entity';
import { DeviceChallengeEntity } from '../../database/entities/device-challenge.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { UserEntity } from '../../database/entities/user.entity';
import { DevicesService } from './devices.service';

const CONFIG: Record<string, unknown> = {
  'app.requireAppAttest': true,
  'app.appAttestTeamId': 'VT2LFN2C8U',
  'app.appAttestBundleId': 'sa.shara.namat',
  'app.appAttestRootCaPem': '', // no root → verifier must reject
  'app.appAttestAllowDevelopment': true,
};

describe('device App Attest flow (enabled build)', () => {
  let db: DataSource;
  let service: DevicesService;

  beforeAll(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ALL_ENTITIES,
      synchronize: true,
    });
    await db.initialize();
    const config = { get: <T>(key: string) => CONFIG[key] as T } as never;
    service = new DevicesService(
      db.getRepository(DeviceEntity),
      db.getRepository(EntitlementEntity),
      undefined,
      config,
    );
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function activeDevice(): Promise<{ userId: string; installationId: string }> {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({ email: `u${Date.now()}@namat.test`, role: 'user', isActive: true }),
    );
    await db.getRepository(EntitlementEntity).save(
      db.getRepository(EntitlementEntity).create({ userId: user.id, status: 'active', plan: 'lifetime', maxDevices: 1 }),
    );
    const installationId = `install-${Date.now()}`;
    await db.getRepository(DeviceEntity).save(
      db.getRepository(DeviceEntity).create({ userId: user.id, installationId, status: 'active' }),
    );
    return { userId: user.id, installationId };
  }

  it('issues a one-time challenge for a registered device', async () => {
    const { userId, installationId } = await activeDevice();
    const res = await service.beginAttestation(userId, installationId);
    expect(res.challengeId).toBeTruthy();
    expect(res.challenge).toBeTruthy();
    const stored = await db.getRepository(DeviceChallengeEntity).findOne({ where: { id: res.challengeId } });
    expect(stored).not.toBeNull();
    // The raw challenge is never stored.
    expect(stored!.nonceHash).not.toBe(res.challenge);
  });

  it('rejects an unknown challenge id (fails closed)', async () => {
    const { userId, installationId } = await activeDevice();
    await expect(
      service.submitAttestation({
        userId,
        installationId,
        challengeId: 'does-not-exist-00',
        challenge: 'Y2hhbGxlbmdl',
        keyId: 'a'.repeat(44),
        attestationObject: 'x'.repeat(120),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a valid challenge when verification fails, consuming the challenge', async () => {
    const { userId, installationId } = await activeDevice();
    const { challengeId, challenge } = await service.beginAttestation(userId, installationId);
    await expect(
      service.submitAttestation({
        userId,
        installationId,
        challengeId,
        challenge,
        keyId: Buffer.alloc(32).toString('base64'),
        attestationObject: Buffer.from('not-a-real-attestation').toString('base64'),
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    // Challenge is single-use even on failure.
    const stored = await db.getRepository(DeviceChallengeEntity).findOne({ where: { id: challengeId } });
    expect(stored!.consumedAt).not.toBeNull();
    const device = await db.getRepository(DeviceEntity).findOne({ where: { installationId } });
    expect(device!.appAttestKeyId).toBeNull();
  });
});
