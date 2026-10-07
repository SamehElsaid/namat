import { createHash, randomBytes } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../../database/entities';
import { UserEntity } from '../../database/entities/user.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { OtpChallengeEntity } from '../../database/entities/otp-challenge.entity';
import { AccountIdentityEntity } from '../../database/entities/account-identity.entity';
import { LoginCodeEntity } from '../../database/entities/login-code.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuthService } from './auth.service';
import { SmtpMailer } from './smtp.mailer';
import { GoogleTokenVerifier } from './google-identity';
import { AuditService } from '../audit/audit.service';
import { AuthGuard } from '../../common/guards/auth.guard';
import {
  ALLOW_PASSWORD_SETUP_KEY,
  IS_ADMIN_KEY,
  IS_OWNER_KEY,
  IS_PUBLIC_KEY,
  PASSWORD_SETUP_KEY,
} from '../../common/decorators/auth.decorators';
import type { Reflector } from '@nestjs/core';

const values: Record<string, string | number> = {
  'app.ownerBootstrapEmail': 'owner@example.com',
  'app.adminBootstrapEmail': '',
  'app.ownerCodeTtlSeconds': 900,
  'app.ownerCodeMaxAttempts': 5,
  'app.ownerCodeRateLimitPerEmail': 3,
  'app.ownerCodeRateWindowSeconds': 900,
  'app.ownerCodeCooldownSeconds': 0,
  'app.loginCodeHashRounds': 4,
  'app.passwordHashRounds': 4,
  'app.passwordMaxAttempts': 5,
  'app.passwordLockSeconds': 900,
  'app.jwtExpiresIn': '30d',
};

function config(): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function errorCode(err: unknown): string {
  const response = (err as { getResponse?: () => unknown }).getResponse?.();
  if (typeof response === 'object' && response && 'error' in response) {
    return String((response as { error: string }).error);
  }
  return '';
}

describe('owner temporary code and password', () => {
  let db: DataSource;
  let auth: AuthService;
  const logs: string[] = [];

  beforeAll(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ALL_ENTITIES,
      synchronize: true,
    });
    await db.initialize();
    const appConfig = config();
    auth = new AuthService(
      db.getRepository(UserEntity),
      db.getRepository(SessionEntity),
      db.getRepository(OtpChallengeEntity),
      new JwtService({ secret: 'test-jwt-secret', signOptions: { expiresIn: '30d' } }),
      appConfig,
      new SmtpMailer(appConfig),
      new GoogleTokenVerifier(appConfig),
      db.getRepository(AccountIdentityEntity),
      db.getRepository(LoginCodeEntity),
      new AuditService(db.getRepository(AuditLogEntity), db.getRepository(UserEntity)),
    );
  });

  beforeEach(() => {
    logs.length = 0;
    jest.spyOn(console, 'log').mockImplementation((line?: unknown) => {
      logs.push(String(line));
    });
    values['app.ownerCodeCooldownSeconds'] = 0;
    values['app.ownerCodeRateLimitPerEmail'] = 3;
    values['app.ownerCodeMaxAttempts'] = 5;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function existingOwnerCandidate() {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'owner@example.com',
        role: 'user',
        isActive: true,
      }),
    );
    await db.getRepository(AccountIdentityEntity).save(
      db.getRepository(AccountIdentityEntity).create({
        userId: user.id,
        provider: 'google',
        providerSubject: 'google-owner-subject',
        email: user.email,
        emailVerified: true,
      }),
    );
    return user;
  }

  function guard(token: string, flags: { owner?: boolean; password?: boolean }) {
    const reflector = {
      getAllAndOverride: (key: string) => {
        if (key === IS_PUBLIC_KEY) return false;
        if (key === IS_OWNER_KEY || key === IS_ADMIN_KEY) return Boolean(flags.owner);
        if (key === PASSWORD_SETUP_KEY) return Boolean(flags.password);
        if (key === ALLOW_PASSWORD_SETUP_KEY) return false;
        return false;
      },
    } as unknown as Reflector;
    return new AuthGuard(reflector, auth, { get: () => '' } as never).canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { authorization: `Bearer ${token}` },
          method: flags.password ? 'POST' : 'GET',
        }),
      }),
    } as never);
  }

  it('reuses the account, assigns owner, and withholds the dashboard until the password is set', async () => {
    const user = await existingOwnerCandidate();
    const issued = await auth.createOwnerLoginCode(user);
    expect(issued.code).toHaveLength(12);
    expect(logs.join('\n')).not.toContain(issued.code);
    const stored = await db.getRepository(LoginCodeEntity).findOneByOrFail({ id: issued.id });
    expect(stored.codeHash).not.toBe(issued.code);
    expect(stored.codeHash).not.toContain(issued.code);
    expect(stored.userId).toBe(user.id);
    expect(stored.purpose).toBe('owner_setup');

    await expect(
      auth.completePasswordSetup(
        { userId: user.id, email: user.email, role: 'user', sessionId: 'missing', purpose: 'customer' },
        'correct-horse-battery',
        'correct-horse-battery',
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const setup = await auth.verifyOwnerLoginCode(user.email, ` ${issued.code.slice(0, 4)}-${issued.code.slice(4)} `);
    expect(setup.user.id).toBe(user.id);
    expect(setup.user.role).toBe('owner');
    expect(setup.passwordSetupRequired).toBe(true);
    expect(setup.purpose).toBe('password_setup');
    expect(await db.getRepository(UserEntity).count({ where: { email: user.email } })).toBe(1);
    expect(await db.getRepository(EntitlementEntity).count({ where: { userId: user.id } })).toBe(0);
    const identity = await db.getRepository(AccountIdentityEntity).findOneByOrFail({ userId: user.id });
    expect(identity.providerSubject).toBe('google-owner-subject');

    const setupUser = await auth.validateAccessToken(setup.accessToken);
    expect((await db.getRepository(LoginCodeEntity).findOneByOrFail({ id: issued.id })).consumedAt).not.toBeNull();
    await expect(auth.verifyOwnerLoginCode(user.email, issued.code)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(setup.accessToken, { owner: true })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(setup.accessToken, { owner: false })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(
      auth.completePasswordSetup(setupUser, 'short-pass', 'short-pass'),
    ).rejects.toMatchObject({ response: { error: 'PasswordTooWeak' } });
    await expect(
      auth.completePasswordSetup(setupUser, 'correct-horse-battery', 'different-horse-battery'),
    ).rejects.toMatchObject({ response: { error: 'PasswordConfirmationMismatch' } });
    expect((await db.getRepository(LoginCodeEntity).findOneByOrFail({ id: issued.id })).consumedAt).not.toBeNull();

    const staff = await auth.completePasswordSetup(
      setupUser,
      'correct-horse-battery',
      'correct-horse-battery',
    );
    expect(staff.passwordSetupRequired).toBe(false);
    expect(staff.purpose).toBe('staff');
    expect(staff.user.id).toBe(user.id);
    await expect(auth.validateAccessToken(setup.accessToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(guard(staff.accessToken, { owner: true })).resolves.toBe(true);
    await expect(auth.verifyOwnerLoginCode(user.email, issued.code)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(auth.completePasswordSetup(setupUser, 'correct-horse-battery', 'correct-horse-battery')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const passwordLogin = await auth.loginWithPassword(user.email, 'correct-horse-battery');
    expect(passwordLogin.purpose).toBe('staff');
    expect(passwordLogin.user.role).toBe('owner');
    await expect(auth.loginWithPassword(user.email, 'wrong-horse-battery')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    const legacyRaw = randomBytes(32).toString('hex');
    const legacy = await db.getRepository(SessionEntity).save(
      db.getRepository(SessionEntity).create({
        userId: user.id,
        tokenHash: createHash('sha256').update(legacyRaw).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        purpose: null,
        loginCodeId: null,
      }),
    );
    const legacyToken = await new JwtService({ secret: 'test-jwt-secret' }).signAsync({
      sub: user.id,
      email: user.email,
      role: 'owner',
      sid: legacy.id,
      jti: legacyRaw,
    });
    expect((await auth.validateAccessToken(legacyToken)).purpose).toBe('customer');
    await expect(guard(legacyToken, { owner: true })).rejects.toBeInstanceOf(UnauthorizedException);

    const roleAudit = await db.getRepository(AuditLogEntity).findOneByOrFail({ action: 'user.role', resourceId: user.id });
    expect(roleAudit.metadata).toEqual({ from: 'user', to: 'owner' });
    const setupAudit = await db.getRepository(AuditLogEntity).findOneByOrFail({
      action: 'owner.password_setup',
      resourceId: user.id,
    });
    expect(JSON.stringify(setupAudit.metadata)).not.toContain('correct-horse');
    expect(JSON.stringify(roleAudit)).not.toContain(issued.code);
    expect(logs.join('\n')).not.toContain(issued.code);
    expect(logs.join('\n')).not.toContain('correct-horse');
  });

  it('limits attempts, expiry, and request rate without storing another account', async () => {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'limited@example.com',
        role: 'owner',
        isActive: true,
      }),
    );
    const issued = await auth.createOwnerLoginCode(user);
    values['app.ownerCodeMaxAttempts'] = 2;
    await expect(auth.verifyOwnerLoginCode(user.email, 'WRONGCODE12')).rejects.toMatchObject({
      response: { error: 'LoginCodeInvalid' },
    });
    await expect(auth.verifyOwnerLoginCode(user.email, 'WRONGCODE99')).rejects.toMatchObject({
      response: { error: 'LoginCodeInvalid' },
    });
    await expect(auth.verifyOwnerLoginCode(user.email, issued.code)).rejects.toMatchObject({
      response: { error: 'LoginCodeAttemptsExceeded' },
    });

    const expired = await auth.createOwnerLoginCode(
      await db.getRepository(UserEntity).save(
        db.getRepository(UserEntity).create({
          email: 'expired@example.com',
          role: 'owner',
          isActive: true,
        }),
      ),
    );
    await db.getRepository(LoginCodeEntity).update({ id: expired.id }, { expiresAt: new Date(Date.now() - 1000) });
    await expect(auth.verifyOwnerLoginCode('expired@example.com', expired.code)).rejects.toMatchObject({
      response: { error: 'LoginCodeExpired' },
    });

    values['app.ownerCodeRateLimitPerEmail'] = 1;
    const rated = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'rated@example.com',
        role: 'owner',
        isActive: true,
      }),
    );
    await auth.createOwnerLoginCode(rated);
    await expect(auth.createOwnerLoginCode(rated)).rejects.toMatchObject({
      response: { error: 'LoginCodeRateLimited' },
    });

    const stranger = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'stranger@example.com',
        role: 'user',
        isActive: true,
      }),
    );
    await expect(auth.createOwnerLoginCode(stranger)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(await db.getRepository(UserEntity).count({ where: { email: 'stranger@example.com' } })).toBe(1);
  });

  it('resets the password with a new code and does not email a code when SMTP is down', async () => {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'reset@example.com',
        role: 'owner',
        isActive: true,
        passwordHash: 'placeholder',
      }),
    );
    await expect(auth.requestOwnerLoginCode(user.email)).rejects.toMatchObject({
      response: { error: 'EmailDeliveryUnavailable' },
    });
    expect(await db.getRepository(LoginCodeEntity).count({ where: { email: user.email } })).toBe(0);

    user.passwordHash = null;
    await db.getRepository(UserEntity).save(user);
    const first = await auth.createOwnerLoginCode(user);
    const setup = await auth.verifyOwnerLoginCode(user.email, first.code);
    const setupUser = await auth.validateAccessToken(setup.accessToken);
    await auth.completePasswordSetup(setupUser, 'first-password-ok', 'first-password-ok');

    const reset = await auth.createOwnerLoginCode(
      await db.getRepository(UserEntity).findOneByOrFail({ id: user.id }),
    );
    expect(reset.purpose).toBe('password_reset');
    const resetSession = await auth.verifyOwnerLoginCode(user.email, reset.code);
    const actor = await auth.validateAccessToken(resetSession.accessToken);
    const done = await auth.completePasswordSetup(actor, 'second-password-ok', 'second-password-ok');
    expect(done.purpose).toBe('staff');
    await expect(auth.loginWithPassword(user.email, 'first-password-ok')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const next = await auth.loginWithPassword(user.email, 'second-password-ok');
    expect(next.purpose).toBe('staff');
    const audit = await db.getRepository(AuditLogEntity).findOneByOrFail({
      action: 'owner.password_reset',
      resourceId: user.id,
    });
    expect(JSON.stringify(audit)).not.toContain('second-password');
    expect(JSON.stringify(audit)).not.toContain(reset.code);
  });

  it('does not put the temporary code in the public email response', async () => {
    const sent: string[] = [];
    const mailer = {
      isConfigured: () => true,
      missing: () => [],
      sendOwnerLoginCode: async (_to: string, code: string) => {
        sent.push(code);
        return 'sent' as const;
      },
    };
    const mailing = new AuthService(
      db.getRepository(UserEntity),
      db.getRepository(SessionEntity),
      db.getRepository(OtpChallengeEntity),
      new JwtService({ secret: 'test-jwt-secret' }),
      config(),
      mailer as unknown as SmtpMailer,
      new GoogleTokenVerifier(config()),
      db.getRepository(AccountIdentityEntity),
      db.getRepository(LoginCodeEntity),
      new AuditService(db.getRepository(AuditLogEntity), db.getRepository(UserEntity)),
    );
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({
        email: 'mailed@example.com',
        role: 'owner',
        isActive: true,
      }),
    );
    const response = await mailing.requestOwnerLoginCode(user.email);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(response)).not.toContain(sent[0]);
    expect(logs.join('\n')).not.toContain(sent[0]);
    expect(errorCode(new UnauthorizedException({ error: 'unused' }))).toBe('unused');
  });
});
