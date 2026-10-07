import { createSign, generateKeyPairSync, KeyObject } from 'crypto';
import { BadRequestException, ForbiddenException, NotImplementedException, UnauthorizedException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../../database/entities';
import { UserEntity } from '../../database/entities/user.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { DeviceEntity } from '../../database/entities/device.entity';
import { DevicesService } from './devices.service';

function errorCode(err: unknown): string {
  const body =
    err && typeof err === 'object' && 'getResponse' in err
      ? (err as { getResponse: () => unknown }).getResponse()
      : null;
  if (typeof body === 'object' && body && 'error' in body) {
    return String((body as { error: string }).error);
  }
  return '';
}

function deviceKey(): { point: string; privateKey: KeyObject } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const point = Buffer.concat([
    Buffer.from([0x04]),
    Buffer.from(jwk.x, 'base64url'),
    Buffer.from(jwk.y, 'base64url'),
  ]).toString('base64');
  return { point, privateKey };
}

function signNonce(privateKey: KeyObject, nonce: string): string {
  const signer = createSign('SHA256');
  signer.update(nonce);
  signer.end();
  return signer.sign(privateKey).toString('base64');
}

describe('one-device activation', () => {
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
    service = new DevicesService(
      db.getRepository(DeviceEntity),
      db.getRepository(EntitlementEntity),
    );
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function user(email: string): Promise<UserEntity> {
    return db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({ email, role: 'user', isActive: true }),
    );
  }

  async function entitle(userId: string): Promise<void> {
    await db.getRepository(EntitlementEntity).save(
      db.getRepository(EntitlementEntity).create({
        userId,
        status: 'active',
        plan: 'lifetime',
        maxDevices: 1,
      }),
    );
  }

  it('activates the first iPhone and rejects a second while it stays active', async () => {
    const owner = await user('one@example.com');
    await entitle(owner.id);
    const first = deviceKey();
    const saved = await service.register({
      userId: owner.id,
      installationId: 'install-one',
      installationToken: 'token-one-device',
      publicKeyPoint: first.point,
    });
    expect(saved.publicKeyFingerprint).toHaveLength(64);
    expect(JSON.stringify(saved)).not.toContain('localKey');
    await expect(
      service.register({
        userId: owner.id,
        installationId: 'install-two',
        installationToken: 'token-two-device',
        publicKeyPoint: deviceKey().point,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a copied installation that presents a different key', async () => {
    const owner = await user('copy@example.com');
    await entitle(owner.id);
    const original = deviceKey();
    await service.register({
      userId: owner.id,
      installationId: 'install-copy',
      publicKeyPoint: original.point,
    });
    try {
      await service.register({
        userId: owner.id,
        installationId: 'install-copy',
        publicKeyPoint: deviceKey().point,
      });
      throw new Error('expected mismatch');
    } catch (err) {
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(errorCode(err)).toBe('DeviceKeyMismatch');
    }
  });

  it('requires a signature and rejects installation id alone', async () => {
    const owner = await user('proof@example.com');
    await entitle(owner.id);
    await service.register({
      userId: owner.id,
      installationId: 'install-proof',
    });
    try {
      await service.beginApplyProof(owner.id, 'install-proof');
      throw new Error('expected proof required');
    } catch (err) {
      expect(errorCode(err)).toBe('ActivationProofRequired');
    }
  });

  it('authorizes Apply only for the active key and rejects a revoked device', async () => {
    const owner = await user('prove@example.com');
    await entitle(owner.id);
    const key = deviceKey();
    await service.register({
      userId: owner.id,
      installationId: 'install-prove',
      publicKeyPoint: key.point,
    });
    const challenge = await service.beginApplyProof(owner.id, 'install-prove');
    await expect(
      service.completeApplyProof(
        owner.id,
        challenge.challengeId,
        challenge.nonce,
        signNonce(deviceKey().privateKey, challenge.nonce),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    await service.completeApplyProof(
      owner.id,
      challenge.challengeId,
      challenge.nonce,
      signNonce(key.privateKey, challenge.nonce),
    );
    await expect(
      service.completeApplyProof(
        owner.id,
        challenge.challengeId,
        challenge.nonce,
        signNonce(key.privateKey, challenge.nonce),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    await service.transfer(owner.id);
    try {
      await service.beginApplyProof(owner.id, 'install-prove');
      throw new Error('expected revoked');
    } catch (err) {
      expect(errorCode(err)).toBe('ActivationRequired');
    }
    const next = deviceKey();
    await service.register({
      userId: owner.id,
      installationId: 'install-prove-next',
      publicKeyPoint: next.point,
    });
    const again = await service.beginApplyProof(owner.id, 'install-prove-next');
    expect(again.nonce).not.toBe(challenge.nonce);
  });

  it('does not let another customer use an activation', async () => {
    const owner = await user('owner-device@example.com');
    const other = await user('other-device@example.com');
    await entitle(owner.id);
    await entitle(other.id);
    const key = deviceKey();
    await service.register({
      userId: owner.id,
      installationId: 'install-owner',
      publicKeyPoint: key.point,
    });
    try {
      await service.beginApplyProof(other.id, 'install-owner');
      throw new Error('expected forbidden');
    } catch (err) {
      expect(errorCode(err)).toBe('ActivationRequired');
    }
  });

  it('lets only one of two simultaneous activations succeed', async () => {
    const owner = await user('race@example.com');
    await entitle(owner.id);
    const results = await Promise.allSettled([
      service.register({
        userId: owner.id,
        installationId: 'install-race-a',
        publicKeyPoint: deviceKey().point,
      }),
      service.register({
        userId: owner.id,
        installationId: 'install-race-b',
        publicKeyPoint: deviceKey().point,
      }),
    ]);
    const ok = results.filter((row) => row.status === 'fulfilled');
    const denied = results.filter((row) => row.status === 'rejected');
    expect(ok).toHaveLength(1);
    expect(denied).toHaveLength(1);
    const active = await db.getRepository(DeviceEntity).count({
      where: { userId: owner.id, status: 'active' },
    });
    expect(active).toBe(1);
  });

  it('rate-limits repeated transfers', async () => {
    const owner = await user('transfer-limit@example.com');
    await entitle(owner.id);
    for (let i = 0; i < 3; i += 1) {
      await service.register({
        userId: owner.id,
        installationId: `install-limit-${i}`,
        publicKeyPoint: deviceKey().point,
      });
      await service.transfer(owner.id);
    }
    await service.register({
      userId: owner.id,
      installationId: 'install-limit-last',
      publicKeyPoint: deviceKey().point,
    });
    try {
      await service.transfer(owner.id);
      throw new Error('expected limit');
    } catch (err) {
      expect(errorCode(err)).toBe('DeviceTransferLimited');
    }
  });

  it('does not accept a client attestation when App Attest is disabled for the build', async () => {
    await expect(
      service.submitAttestation({
        userId: 'u',
        installationId: 'install-123456',
        challengeId: 'challenge-000000',
        challenge: 'Y2hhbGxlbmdl',
        keyId: 'a'.repeat(44),
        attestationObject: 'x'.repeat(120),
      }),
    ).rejects.toBeInstanceOf(NotImplementedException);
  });
});
