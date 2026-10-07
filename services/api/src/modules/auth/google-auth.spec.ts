import { createSign, generateKeyPairSync } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ALL_ENTITIES } from '../../database/entities';
import { UserEntity } from '../../database/entities/user.entity';
import { OtpChallengeEntity } from '../../database/entities/otp-challenge.entity';
import { AccountIdentityEntity } from '../../database/entities/account-identity.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { DeviceEntity } from '../../database/entities/device.entity';
import { PurchaseEntity } from '../../database/entities/purchase.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { AuthService } from './auth.service';
import { SmtpMailer } from './smtp.mailer';
import { GoogleTokenVerifier } from './google-identity';
import { LoginCodeEntity } from '../../database/entities/login-code.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';

const SERVER =
  '588751829801-hncn7v533cpfbbhj6f6nodi7emk92spf.apps.googleusercontent.com';
const IOS =
  '588751829801-o1l3gdt9fcquhn4ncq5kgig10c7fb0tq.apps.googleusercontent.com';

function config(): ConfigService {
  const values: Record<string, string> = {
    'app.googleServerClientId': SERVER,
    'app.jwtExpiresIn': '30d',
    'app.ownerBootstrapEmail': 'owner@example.com',
    'app.adminBootstrapEmail': 'admin@example.com',
    'app.otpMaxAttempts': '5',
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function signToken(
  privateKey: string,
  payload: Record<string, unknown>,
): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const data = `${encode({ alg: 'RS256', typ: 'JWT', kid: 'test' })}.${encode(payload)}`;
  const signer = createSign('RSA-SHA256');
  signer.update(data);
  return `${data}.${signer.sign(privateKey).toString('base64url')}`;
}

function claims(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: 'https://accounts.google.com',
    aud: SERVER,
    sub: 'google-sub',
    email: 'person@example.com',
    email_verified: true,
    iat: now,
    exp: now + 3600,
    ...overrides,
  };
}

function errorCode(err: unknown): string {
  if (!(err instanceof UnauthorizedException)) return '';
  const body = err.getResponse();
  if (typeof body === 'object' && body && 'error' in body) {
    return String((body as { error: string }).error);
  }
  return '';
}

describe('Google ID token verification', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const certs = {
    test: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
  const verifier = new GoogleTokenVerifier(config());

  async function verify(payload: Record<string, unknown>, token = signToken(privateKey, payload)) {
    return verifier.verifyAgainstCerts(token, certs);
  }

  it('accepts a signed token and ignores nothing outside the verified claims', async () => {
    const identity = await verify(
      claims({ email: 'Person@Example.com', name: 'Ignored Name' }),
    );
    expect(identity).toEqual({
      provider: 'google',
      subject: 'google-sub',
      email: 'person@example.com',
      emailVerified: true,
    });
  });

  it('rejects the iOS client id as the audience', async () => {
    await expect(verify(claims({ aud: IOS }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('rejects a wrong issuer', async () => {
    const token = signToken(privateKey, claims({ iss: 'https://evil.example' }));
    await expect(verifier.verifyAgainstCerts(token, certs)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    try {
      await verifier.verifyAgainstCerts(token, certs);
    } catch (err) {
      expect(JSON.stringify(err)).not.toContain(token);
      expect(errorCode(err)).toBe('GoogleTokenInvalid');
    }
  });

  it('rejects an expired token', async () => {
    const now = Math.floor(Date.now() / 1000);
    await expect(
      verify(claims({ iat: now - 7200, exp: now - 3600 })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an invalid signature', async () => {
    const token = signToken(privateKey, claims());
    const broken = `${token.slice(0, -4)}aaaa`;
    try {
      await verifier.verifyAgainstCerts(broken, certs);
      throw new Error('expected rejection');
    } catch (err) {
      expect(err).toBeInstanceOf(UnauthorizedException);
      expect(JSON.stringify(err)).not.toContain(broken);
      expect(errorCode(err)).toBe('GoogleTokenInvalid');
    }
  });

  it('rejects a token without sub', async () => {
    const payload = claims();
    delete payload.sub;
    await expect(verify(payload)).rejects.toBeInstanceOf(UnauthorizedException);
    try {
      await verify(payload);
    } catch (err) {
      expect(errorCode(err)).toBe('GoogleTokenInvalid');
    }
  });

  it('rejects an unverified email without treating it as identity', async () => {
    await expect(verify(claims({ email_verified: false }))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    try {
      await verify(claims({ email_verified: false }));
    } catch (err) {
      expect(errorCode(err)).toBe('GoogleEmailUnverified');
    }
  });
});

describe('Google account linking', () => {
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKey = pair.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const certs = {
    test: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
  let db: DataSource;
  let auth: AuthService;

  beforeAll(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ALL_ENTITIES,
      synchronize: true,
    });
    await db.initialize();
    class LocalVerifier extends GoogleTokenVerifier {
      override verify(idToken: string) {
        return this.verifyAgainstCerts(idToken, certs);
      }
    }
    const appConfig = config();
    auth = new AuthService(
      db.getRepository(UserEntity),
      db.getRepository(SessionEntity),
      db.getRepository(OtpChallengeEntity),
      new JwtService({ secret: 'test-jwt-secret', signOptions: { expiresIn: '30d' } }),
      appConfig,
      new SmtpMailer(appConfig),
      new LocalVerifier(appConfig),
      db.getRepository(AccountIdentityEntity),
      db.getRepository(LoginCodeEntity),
      new AuditService(
        db.getRepository(AuditLogEntity),
        db.getRepository(UserEntity),
      ),
    );
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  function token(overrides: Record<string, unknown> = {}): string {
    return signToken(privateKey, claims(overrides));
  }

  it('creates an account on the first login and reuses it for the same subject', async () => {
    const raw = token({ sub: 'sub-new', email: 'new@example.com' });
    const first = await auth.loginWithGoogle(raw);
    const second = await auth.loginWithGoogle(raw);
    expect(second.user.id).toBe(first.user.id);
    expect(second.user.role).toBe('user');
    expect(JSON.stringify(second)).not.toContain(raw);
    const users = await db.getRepository(UserEntity).count({ where: { email: 'new@example.com' } });
    const links = await db.getRepository(AccountIdentityEntity).count({
      where: { providerSubject: 'sub-new' },
    });
    expect(users).toBe(1);
    expect(links).toBe(1);
    const session = await auth.validateAccessToken(first.accessToken);
    expect(session.userId).toBe(first.user.id);
    expect(session.role).toBe('user');
    expect(session.purpose).toBe('customer');
  });

  it('links a verified email onto the existing account without changing role or purchases', async () => {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'returning@example.com',
        role: 'owner',
        isActive: true,
      }),
    );
    const purchase = await db.getRepository(PurchaseEntity).save(
      db.getRepository(PurchaseEntity).create({
        userId: user.id,
        status: 'approved',
        amountMinor: 29900,
        customerReferenceNumber: 'ref-returning',
      }),
    );
    const entitlement = await db.getRepository(EntitlementEntity).save(
      db.getRepository(EntitlementEntity).create({
        userId: user.id,
        purchaseId: purchase.id,
        status: 'active',
        plan: 'lifetime',
        maxDevices: 2,
      }),
    );
    await db.getRepository(DeviceEntity).save(
      db.getRepository(DeviceEntity).create({
        userId: user.id,
        installationId: 'install-returning',
        status: 'active',
      }),
    );
    const result = await auth.loginWithGoogle(
      token({ sub: 'sub-returning', email: 'returning@example.com' }),
    );
    expect(result.user.id).toBe(user.id);
    expect(result.user.role).toBe('owner');
    const savedEntitlement = await db.getRepository(EntitlementEntity).findOneByOrFail({
      id: entitlement.id,
    });
    const device = await db.getRepository(DeviceEntity).findOneByOrFail({
      installationId: 'install-returning',
    });
    const savedPurchase = await db.getRepository(PurchaseEntity).findOneByOrFail({
      id: purchase.id,
    });
    expect(savedEntitlement.userId).toBe(user.id);
    expect(savedPurchase.userId).toBe(user.id);
    expect(device.userId).toBe(user.id);
  });

  it('does not make a customer owner because the email matches the bootstrap address', async () => {
    const result = await auth.loginWithGoogle(
      token({ sub: 'sub-owner-email', email: 'owner@example.com' }),
    );
    expect(result.user.role).toBe('user');
    const code = '123456';
    await db.getRepository(OtpChallengeEntity).save(
      db.getRepository(OtpChallengeEntity).create({
        email: 'owner@example.com',
        codeHash: await bcrypt.hash(code, 4),
        attempts: 0,
        expiresAt: new Date(Date.now() + 60_000),
        consumedAt: null,
      }),
    );
    const otp = await auth.verifyOtp('owner@example.com', code);
    expect(otp.user.id).toBe(result.user.id);
    expect(otp.user.role).toBe('owner');
    expect(otp.purpose).toBe('customer');
    expect(otp.passwordSetupRequired).toBe(false);
    const otpSession = await auth.validateAccessToken(otp.accessToken);
    expect(otpSession.purpose).toBe('customer');
    const again = await auth.loginWithGoogle(
      token({ sub: 'sub-owner-email', email: 'owner@example.com' }),
    );
    expect(again.user.id).toBe(result.user.id);
    expect(again.user.role).toBe('owner');
    expect(again.purpose).toBe('customer');
    expect(await db.getRepository(EntitlementEntity).count({ where: { userId: result.user.id } })).toBe(0);
  });

  it('does not link or create an account from an unverified email', async () => {
    await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'unverified@example.com',
        role: 'user',
        isActive: true,
      }),
    );
    try {
      await auth.loginWithGoogle(
        token({
          sub: 'sub-unverified',
          email: 'unverified@example.com',
          email_verified: false,
        }),
      );
      throw new Error('expected rejection');
    } catch (err) {
      expect(errorCode(err)).toBe('GoogleEmailUnverified');
    }
    const links = await db.getRepository(AccountIdentityEntity).count({
      where: { email: 'unverified@example.com' },
    });
    expect(links).toBe(0);
  });

  it('does not sign in a disabled account that already has this Google subject', async () => {
    const created = await auth.loginWithGoogle(
      token({ sub: 'sub-disabled', email: 'disabled@example.com' }),
    );
    await db.getRepository(UserEntity).update({ id: created.user.id }, { isActive: false });
    try {
      await auth.loginWithGoogle(
        token({ sub: 'sub-disabled', email: 'disabled@example.com' }),
      );
      throw new Error('expected rejection');
    } catch (err) {
      expect(errorCode(err)).toBe('AccountDisabled');
    }
  });

  it('does not replace an existing Google subject for the same account', async () => {
    await auth.loginWithGoogle(token({ sub: 'sub-first', email: 'linked@example.com' }));
    try {
      await auth.loginWithGoogle(token({ sub: 'sub-second', email: 'linked@example.com' }));
      throw new Error('expected rejection');
    } catch (err) {
      expect(errorCode(err)).toBe('GoogleAccountConflict');
    }
    const links = await db.getRepository(AccountIdentityEntity).find({
      where: { email: 'linked@example.com' },
    });
    expect(links.map((link) => link.providerSubject)).toEqual(['sub-first']);
  });
});
