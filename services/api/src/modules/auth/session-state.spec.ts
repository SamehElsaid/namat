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
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { AuthService } from './auth.service';
import { SmtpMailer } from './smtp.mailer';
import { GoogleTokenVerifier } from './google-identity';
import { AuditService } from '../audit/audit.service';
import { UsersService } from '../users/users.service';
import { AuthUser } from '../../common/decorators/auth.decorators';

const values: Record<string, string | number> = { 'app.jwtExpiresIn': '30d' };
const config = { get: (key: string) => values[key] } as unknown as ConfigService;
const jwt = new JwtService({ secret: 'test-jwt-secret', signOptions: { expiresIn: '30d' } });

describe('session follows the stored account', () => {
  let db: DataSource;
  let auth: AuthService;
  let users: UsersService;
  const owner: AuthUser = {
    userId: 'owner-1',
    email: 'owner@example.com',
    role: 'owner',
    sessionId: 's-owner',
  };

  beforeAll(async () => {
    db = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: ALL_ENTITIES,
      synchronize: true,
    });
    await db.initialize();
    const audit = new AuditService(
      db.getRepository(AuditLogEntity),
      db.getRepository(UserEntity),
    );
    auth = new AuthService(
      db.getRepository(UserEntity),
      db.getRepository(SessionEntity),
      db.getRepository(OtpChallengeEntity),
      jwt,
      config,
      new SmtpMailer(config),
      new GoogleTokenVerifier(config),
      db.getRepository(AccountIdentityEntity),
      db.getRepository(LoginCodeEntity),
      audit,
    );
    users = new UsersService(
      db.getRepository(UserEntity),
      db.getRepository(SessionEntity),
      audit,
    );
  });

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function signedIn(email: string, role: UserEntity['role'], claimedRole = role) {
    const user = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({ email, role, isActive: true }),
    );
    const raw = randomBytes(16).toString('hex');
    const session = await db.getRepository(SessionEntity).save(
      db.getRepository(SessionEntity).create({
        userId: user.id,
        tokenHash: createHash('sha256').update(raw).digest('hex'),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
      }),
    );
    const token = await jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: claimedRole,
      sid: session.id,
      jti: raw,
    });
    return { user, token };
  }

  it('uses the stored role, not the role in the token', async () => {
    const { token } = await signedIn('demoted@example.com', 'user', 'admin');
    expect((await auth.validateAccessToken(token)).role).toBe('user');
  });

  it('rejects the token of a disabled account', async () => {
    const { user, token } = await signedIn('disabled@example.com', 'user');
    await db.getRepository(UserEntity).update({ id: user.id }, { isActive: false });
    await expect(auth.validateAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes sessions when an account is disabled', async () => {
    const { user, token } = await signedIn('off@example.com', 'user');
    await users.setActive(owner, user.id, false);
    await users.setActive(owner, user.id, true);
    await expect(auth.validateAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('revokes sessions when the role changes', async () => {
    const { user, token } = await signedIn('staff@example.com', 'admin');
    await users.setRole(owner, user.id, 'user');
    await expect(auth.validateAccessToken(token)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
