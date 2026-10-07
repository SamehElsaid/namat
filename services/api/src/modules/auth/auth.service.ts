import {
  BadRequestException,
  HttpException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { IsNull, MoreThan, Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { UserEntity } from '../../database/entities/user.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { OtpChallengeEntity } from '../../database/entities/otp-challenge.entity';
import { AccountIdentityEntity } from '../../database/entities/account-identity.entity';
import { LoginCodeEntity } from '../../database/entities/login-code.entity';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { StructuredLogger } from '../../common/logging/logger';
import { AuthUser, SessionPurpose, isStaffRole } from '../../common/decorators/auth.decorators';
import { AuditService } from '../audit/audit.service';
import { SmtpMailer } from './smtp.mailer';
import {
  GoogleTokenVerifier,
  VerifiedGoogleIdentity,
} from './google-identity';

@Injectable()
export class AuthService {
  private readonly log = new StructuredLogger('AuthService');

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(OtpChallengeEntity)
    private readonly otps: Repository<OtpChallengeEntity>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mailer: SmtpMailer,
    private readonly google: GoogleTokenVerifier,
    @InjectRepository(AccountIdentityEntity)
    private readonly identities: Repository<AccountIdentityEntity>,
    @InjectRepository(LoginCodeEntity)
    private readonly loginCodes: Repository<LoginCodeEntity>,
    private readonly audit: AuditService,
  ) {}

  async requestOtp(emailRaw: string): Promise<{
    ok: true;
    expiresIn: number;
    cooldownSeconds: number;
    delivery: 'smtp' | 'dev_log';
  }> {
    const email = this.normalizeEmail(emailRaw);
    const windowSec =
      this.config.get<number>('app.otpRateWindowSeconds') ?? 900;
    const maxPerEmail =
      this.config.get<number>('app.otpRateLimitPerEmail') ?? 5;
    const since = new Date(Date.now() - windowSec * 1000);
    const recent = await this.otps.count({
      where: { email, createdAt: MoreThan(since) },
    });
    if (recent >= maxPerEmail) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'OtpRateLimited',
          message: 'Too many OTP requests. Try again later.',
        },
        429,
      );
    }

    const cooldownSec = this.config.get<number>('app.otpCooldownSeconds') ?? 60;
    const latest = await this.otps.findOne({
      where: { email },
      order: { createdAt: 'DESC' },
    });
    if (latest) {
      const elapsedMs = Date.now() - latest.createdAt.getTime();
      const waitMs = cooldownSec * 1000 - elapsedMs;
      if (waitMs > 0) {
        throw new HttpException(
          {
            statusCode: 429,
            error: 'OtpCooldown',
            message: 'Wait before requesting another code.',
            retryAfterSeconds: Math.ceil(waitMs / 1000),
          },
          429,
        );
      }
    }

    const length = this.config.get<number>('app.otpLength') ?? 6;
    const ttl = this.config.get<number>('app.otpTtlSeconds') ?? 600;
    const code = this.generateNumericCode(length);
    const codeHash = await bcrypt.hash(code, 10);
    const saved = await this.otps.save(
      this.otps.create({
        email,
        codeHash,
        attempts: 0,
        expiresAt: new Date(Date.now() + ttl * 1000),
        consumedAt: null,
      }),
    );

    const isProd = (process.env.NODE_ENV ?? 'development') === 'production';
    const emailRef = crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
    // Never log the OTP code in production (SMTP present or absent).
    if (!isProd) {
      this.log.info('OTP issued (dev)', { email, devOtp: code });
    } else {
      this.log.info('OTP issued', {
        emailRef,
        smtpConfigured: this.mailer.isConfigured(),
      });
    }

    let delivery: 'smtp' | 'dev_log' = 'dev_log';
    if (this.mailer.isConfigured()) {
      try {
        await this.mailer.sendOtpEmail(email, code, ttl);
        delivery = 'smtp';
      } catch {
        await this.otps.delete({ id: saved.id });
        this.log.warn('OTP email failed', { emailRef });
        throw new ServiceUnavailableException({
          error: 'EmailDeliveryUnavailable',
          message: 'Verification email is unavailable.',
        });
      }
    } else if (isProd) {
      await this.otps.delete({ id: saved.id });
      this.log.warn('OTP email unavailable', { missing: this.mailer.missing() });
      throw new ServiceUnavailableException({
        error: 'EmailDeliveryUnavailable',
        message: 'Verification email is unavailable.',
      });
    }

    return { ok: true, expiresIn: ttl, cooldownSeconds: cooldownSec, delivery };
  }

  async verifyOtp(
    emailRaw: string,
    code: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; user: { id: string; email: string; role: string } }> {
    const email = this.normalizeEmail(emailRaw);
    const challenge = await this.otps.findOne({
      where: { email },
      order: { createdAt: 'DESC' },
    });
    if (!challenge || challenge.consumedAt) {
      throw new UnauthorizedException({
        error: 'OtpInvalid',
        message: 'The code is not correct.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        error: 'OtpExpired',
        message: 'The code has expired.',
      });
    }
    const maxAttempts = this.config.get<number>('app.otpMaxAttempts') ?? 5;
    if (challenge.attempts >= maxAttempts) {
      throw new UnauthorizedException({
        error: 'OtpAttemptsExceeded',
        message: 'Too many attempts.',
      });
    }
    const ok = await bcrypt.compare(code, challenge.codeHash);
    if (!ok) {
      challenge.attempts += 1;
      await this.otps.save(challenge);
      throw new UnauthorizedException({
        error: 'OtpInvalid',
        message: 'The code is not correct.',
      });
    }
    challenge.consumedAt = new Date();
    await this.otps.save(challenge);

    let user = await this.users.findOne({ where: { email } });
    const bootstrapRole = this.bootstrapRoleFor(email);
    if (!user) {
      user = await this.users.save(
        this.users.create({
          email,
          role: bootstrapRole,
          isActive: true,
        }),
      );
      if (bootstrapRole === 'owner') {
        await this.auditRole(user, null, 'owner');
      }
    } else {
      user = await this.applyOwnerBootstrap(user, email);
    }
    if (!user.isActive) {
      throw new UnauthorizedException({
        error: 'AccountDisabled',
        message: 'Sign-in could not be completed.',
      });
    }

    // Customer OTP never opens the owner dashboard. Password setup uses the
    // owner temporary code, which is bound to a single login_codes row.
    return this.issueSession(user, meta, { purpose: 'customer' });
  }

  /**
   * Google sign-in. SMTP is not used.
   * Role is never granted from the Google email. Owner promotion stays on
   * OWNER_BOOTSTRAP_EMAIL during OTP or owner-code verification.
   * The session is always a customer session, so Google cannot open the
   * owner dashboard or skip password setup.
   */
  async loginWithGoogle(
    idToken: string,
    meta?: { userAgent?: string; ip?: string },
  ): Promise<{ accessToken: string; user: { id: string; email: string; role: string } }> {
    if (!idToken || idToken.length < 20 || idToken.length > 8192) {
      throw new UnauthorizedException({
        error: 'GoogleTokenInvalid',
        message: 'Google sign-in could not be verified.',
      });
    }
    const identity = await this.google.verify(idToken);
    const user = await this.resolveGoogleUser(identity);
    return this.issueSession(user, meta, { purpose: 'customer' });
  }

  private async resolveGoogleUser(
    identity: VerifiedGoogleIdentity,
  ): Promise<UserEntity> {
    try {
      return await this.users.manager.transaction(async (manager) => {
      const identities = manager.getRepository(AccountIdentityEntity);
      const users = manager.getRepository(UserEntity);
      const linked = await identities.findOne({
        where: { provider: 'google', providerSubject: identity.subject },
      });
      if (linked) {
        const user = await users.findOne({ where: { id: linked.userId } });
        if (!user || !user.isActive) {
          throw new UnauthorizedException({
            error: 'AccountDisabled',
            message: 'Sign-in could not be completed.',
          });
        }
        return user;
      }

      const existing = await users.findOne({ where: { email: identity.email } });
      if (existing) {
        if (!existing.isActive) {
          throw new UnauthorizedException({
            error: 'AccountDisabled',
            message: 'Sign-in could not be completed.',
          });
        }
        const other = await identities.findOne({
          where: { userId: existing.id, provider: 'google' },
        });
        if (other && other.providerSubject !== identity.subject) {
          throw new UnauthorizedException({
            error: 'GoogleAccountConflict',
            message: 'Google sign-in could not be verified.',
          });
        }
        await identities.save(
          identities.create({
            userId: existing.id,
            provider: 'google',
            providerSubject: identity.subject,
            email: identity.email,
            emailVerified: true,
          }),
        );
        return existing;
      }

      const created = await users.save(
        users.create({
          email: identity.email,
          role: 'user',
          isActive: true,
        }),
      );
      await identities.save(
        identities.create({
          userId: created.id,
          provider: 'google',
          providerSubject: identity.subject,
          email: identity.email,
          emailVerified: true,
        }),
      );
      return created;
      });
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      this.log.warn('Google account link failed');
      throw new UnauthorizedException({
        error: 'GoogleTokenInvalid',
        message: 'Google sign-in could not be verified.',
      });
    }
  }

  private async issueSession(
    user: UserEntity,
    meta?: { userAgent?: string; ip?: string },
    options?: {
      purpose?: SessionPurpose;
      loginCodeId?: string | null;
      expiresIn?: string;
    },
  ): Promise<{
    accessToken: string;
    passwordSetupRequired: boolean;
    purpose: SessionPurpose;
    user: { id: string; email: string; role: string };
  }> {
    const purpose = options?.purpose ?? 'customer';
    if (purpose === 'staff' && !user.passwordHash) {
      throw new UnauthorizedException({
        error: 'PasswordSetupRequired',
        message: 'Set a password before continuing.',
      });
    }
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresIn =
      options?.expiresIn ??
      (purpose === 'password_setup'
        ? '15m'
        : (this.config.get<string>('app.jwtExpiresIn') ?? '30d'));
    const expiresAt = this.parseExpiry(expiresIn);

    const session = await this.sessions.save(
      this.sessions.create({
        userId: user.id,
        tokenHash,
        expiresAt,
        revokedAt: null,
        userAgent: meta?.userAgent?.slice(0, 64) ?? null,
        ipHash: meta?.ip
          ? crypto.createHash('sha256').update(meta.ip).digest('hex').slice(0, 64)
          : null,
        purpose,
        loginCodeId: options?.loginCodeId ?? null,
      }),
    );

    const accessToken = await this.jwt.signAsync(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        sid: session.id,
        purpose,
        // Embed raw token hash material for session binding via jti
        jti: rawToken,
      },
      { expiresIn },
    );

    return {
      accessToken,
      passwordSetupRequired: purpose === 'password_setup',
      purpose,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  async validateAccessToken(token: string): Promise<AuthUser> {
    let payload: {
      sub: string;
      email: string;
      role: 'user' | 'admin' | 'owner';
      sid: string;
      jti: string;
      purpose?: SessionPurpose;
    };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException('Invalid session');
    }
    const session = await this.sessions.findOne({
      where: { id: payload.sid },
    });
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt < new Date() ||
      session.tokenHash !== this.hashToken(payload.jti)
    ) {
      throw new UnauthorizedException('Session expired');
    }
    const tokenPurpose = payload.purpose ?? 'customer';
    const sessionPurpose = session.purpose ?? 'customer';
    if (tokenPurpose !== sessionPurpose) {
      throw new UnauthorizedException('Invalid session');
    }
    // The JWT role and active flag are a snapshot from sign-in. Read the
    // account on every request so a disable or demotion applies immediately.
    const user = await this.users.findOne({ where: { id: payload.sub } });
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Session expired');
    }
    return {
      userId: payload.sub,
      email: user.email,
      role: user.role,
      sessionId: payload.sid,
      purpose: sessionPurpose,
    };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId }, { revokedAt: new Date() });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update(SessionEntity)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId AND "revokedAt" IS NULL', { userId })
      .execute();
  }

  /**
   * Public request. Sends mail when SMTP is configured.
   * Does not return the code. Does not create an account.
   */
  async requestOwnerLoginCode(emailRaw: string): Promise<{ ok: true; delivery: 'smtp' }> {
    if (!this.mailer.isConfigured()) {
      this.log.warn('Owner login email unavailable', { missing: this.mailer.missing() });
      throw new ServiceUnavailableException({
        error: 'EmailDeliveryUnavailable',
        message: 'Verification email is unavailable.',
      });
    }
    const email = this.normalizeEmail(emailRaw);
    const user = await this.users.findOne({ where: { email } });
    if (!user || !user.isActive || !this.canIssueOwnerCode(user, email)) {
      return { ok: true, delivery: 'smtp' };
    }
    const issued = await this.createOwnerLoginCode(user, email);
    try {
      await this.mailer.sendOwnerLoginCode(email, issued.code, this.ownerCodeTtl());
    } catch {
      await this.loginCodes.delete({ id: issued.id });
      this.log.warn('Owner login email failed', { emailRef: this.emailRef(email) });
      throw new ServiceUnavailableException({
        error: 'EmailDeliveryUnavailable',
        message: 'Verification email is unavailable.',
      });
    }
    return { ok: true, delivery: 'smtp' };
  }

  /**
   * Creates a hashed code for an existing eligible account.
   * Returns the plaintext only to the caller that will deliver it out of band.
   * The HTTP controller does not use this method.
   */
  async createOwnerLoginCode(
    user: UserEntity,
    emailRaw?: string,
  ): Promise<{ id: string; code: string; expiresAt: Date; purpose: 'owner_setup' | 'password_reset' }> {
    const email = this.normalizeEmail(emailRaw ?? user.email);
    if (!user.isActive || !this.canIssueOwnerCode(user, email)) {
      throw new UnauthorizedException({
        error: 'LoginCodeInvalid',
        message: 'The temporary code is not correct.',
      });
    }
    const windowSec = this.num('app.ownerCodeRateWindowSeconds', 900);
    const maxPerEmail = this.num('app.ownerCodeRateLimitPerEmail', 3);
    const since = new Date(Date.now() - windowSec * 1000);
    const recent = await this.loginCodes.count({
      where: { email, createdAt: MoreThan(since) },
    });
    if (recent >= maxPerEmail) {
      throw new HttpException(
        {
          statusCode: 429,
          error: 'LoginCodeRateLimited',
          message: 'Too many code requests. Try again later.',
        },
        429,
      );
    }
    const cooldownSec = this.num('app.ownerCodeCooldownSeconds', 60);
    const latest = await this.loginCodes.findOne({
      where: { email },
      order: { createdAt: 'DESC' },
    });
    if (latest && cooldownSec > 0) {
      const waitMs = cooldownSec * 1000 - (Date.now() - latest.createdAt.getTime());
      if (waitMs > 0) {
        throw new HttpException(
          {
            statusCode: 429,
            error: 'LoginCodeCooldown',
            message: 'Wait before requesting another code.',
            retryAfterSeconds: Math.ceil(waitMs / 1000),
          },
          429,
        );
      }
    }
    const code = this.generateOwnerCode(12);
    const codeHash = await bcrypt.hash(code, this.num('app.loginCodeHashRounds', 10));
    const expiresAt = new Date(Date.now() + this.ownerCodeTtl() * 1000);
    const purpose: 'owner_setup' | 'password_reset' = user.passwordHash
      ? 'password_reset'
      : 'owner_setup';
    const now = new Date();
    await this.loginCodes
      .createQueryBuilder()
      .update(LoginCodeEntity)
      .set({ consumedAt: now })
      .where('email = :email AND "consumedAt" IS NULL', { email })
      .execute();
    const saved = await this.loginCodes.save(
      this.loginCodes.create({
        userId: user.id,
        email,
        purpose,
        codeHash,
        attempts: 0,
        expiresAt,
        consumedAt: null,
      }),
    );
    this.log.info('Owner login code issued', {
      emailRef: this.emailRef(email),
      purpose,
    });
    return { id: saved.id, code, expiresAt, purpose };
  }

  async verifyOwnerLoginCode(
    emailRaw: string,
    codeRaw: string,
    meta?: { userAgent?: string; ip?: string },
  ) {
    const email = this.normalizeEmail(emailRaw);
    const code = this.normalizeOwnerCode(codeRaw);
    const user = await this.users.findOne({ where: { email } });
    const challenge = user ? await this.latestOwnerCode(email) : null;
    if (!user || !user.isActive || !challenge) {
      throw new UnauthorizedException({
        error: 'LoginCodeInvalid',
        message: 'The temporary code is not correct.',
      });
    }
    if (challenge.expiresAt < new Date()) {
      throw new UnauthorizedException({
        error: 'LoginCodeExpired',
        message: 'The temporary code has expired.',
      });
    }
    const maxAttempts = this.num('app.ownerCodeMaxAttempts', 5);
    if (challenge.attempts >= maxAttempts) {
      throw new UnauthorizedException({
        error: 'LoginCodeAttemptsExceeded',
        message: 'Too many attempts.',
      });
    }
    const ok = await bcrypt.compare(code, challenge.codeHash);
    if (!ok) {
      challenge.attempts += 1;
      await this.loginCodes.save(challenge);
      throw new UnauthorizedException({
        error: 'LoginCodeInvalid',
        message: 'The temporary code is not correct.',
      });
    }
    const promoted = await this.applyOwnerBootstrap(user, email);
    if (!isStaffRole(promoted.role)) {
      throw new UnauthorizedException({
        error: 'LoginCodeInvalid',
        message: 'The temporary code is not correct.',
      });
    }
    const now = new Date();
    const consumed = await this.loginCodes
      .createQueryBuilder()
      .update(LoginCodeEntity)
      .set({ consumedAt: now })
      .where('id = :id AND "consumedAt" IS NULL AND "expiresAt" > :now', {
        id: challenge.id,
        now,
      })
      .execute();
    if (!consumed.affected) {
      throw new UnauthorizedException({
        error: 'LoginCodeInvalid',
        message: 'The temporary code is not correct.',
      });
    }
    return this.issueSession(promoted, meta, {
      purpose: 'password_setup',
      loginCodeId: challenge.id,
      expiresIn: '15m',
    });
  }

  async completePasswordSetup(
    actor: AuthUser,
    password: string,
    confirmation: string,
    meta?: { userAgent?: string; ip?: string },
  ) {
    if ((actor.purpose ?? 'customer') !== 'password_setup') {
      throw new UnauthorizedException({
        error: 'PasswordSetupRequired',
        message: 'Set a password before continuing.',
      });
    }
    if (password !== confirmation) {
      throw new BadRequestException({
        error: 'PasswordConfirmationMismatch',
        message: 'Password confirmation does not match.',
      });
    }
    if (!this.passwordIsAcceptable(password, actor.email)) {
      throw new BadRequestException({
        error: 'PasswordTooWeak',
        message: 'Use at least 12 characters.',
      });
    }
    const passwordHash = await bcrypt.hash(password, this.num('app.passwordHashRounds', 12));
    const outcome = await this.users.manager.transaction(async (manager) => {
      const sessions = manager.getRepository(SessionEntity);
      const codes = manager.getRepository(LoginCodeEntity);
      const users = manager.getRepository(UserEntity);
      const audits = manager.getRepository(AuditLogEntity);
      const session = await sessions.findOne({ where: { id: actor.sessionId } });
      if (
        !session ||
        session.revokedAt ||
        session.purpose !== 'password_setup' ||
        !session.loginCodeId ||
        session.userId !== actor.userId
      ) {
        throw new UnauthorizedException({
          error: 'PasswordSetupRequired',
          message: 'Set a password before continuing.',
        });
      }
      const now = new Date();
      const claimed = await sessions
        .createQueryBuilder()
        .update(SessionEntity)
        .set({ revokedAt: now })
        .where(
          'id = :id AND "revokedAt" IS NULL AND purpose = :purpose AND "userId" = :userId AND "loginCodeId" IS NOT NULL',
          {
            id: actor.sessionId,
            purpose: 'password_setup',
            userId: actor.userId,
          },
        )
        .execute();
      if (!claimed.affected) {
        throw new UnauthorizedException({
          error: 'PasswordSetupRequired',
          message: 'Set a password before continuing.',
        });
      }
      const code = await codes.findOne({ where: { id: session.loginCodeId } });
      const user = await users.findOne({ where: { id: actor.userId } });
      if (!user || !user.isActive || !isStaffRole(user.role)) {
        throw new UnauthorizedException({
          error: 'AccountDisabled',
          message: 'Sign-in could not be completed.',
        });
      }
      if (
        !code ||
        code.userId !== user.id ||
        !code.consumedAt ||
        code.consumedAt.getTime() > code.expiresAt.getTime()
      ) {
        throw new UnauthorizedException({
          error: 'LoginCodeInvalid',
          message: 'The temporary code is not correct.',
        });
      }
      user.passwordHash = passwordHash;
      user.passwordSetAt = now;
      user.passwordFailedAttempts = 0;
      user.passwordLockedUntil = null;
      await users.save(user);
      await sessions
        .createQueryBuilder()
        .update(SessionEntity)
        .set({ revokedAt: now })
        .where('"userId" = :userId AND "revokedAt" IS NULL', { userId: user.id })
        .execute();
      await audits.save(
        audits.create({
          action: code?.purpose === 'password_reset' ? 'owner.password_reset' : 'owner.password_setup',
          actorUserId: user.id,
          actorType: user.role,
          resourceType: 'user',
          resourceId: user.id,
          metadata: { completed: true },
          result: 'success',
        }),
      );
      return user;
    });
    return this.issueSession(outcome, meta, { purpose: 'staff' });
  }

  async loginWithPassword(
    emailRaw: string,
    password: string,
    meta?: { userAgent?: string; ip?: string },
  ) {
    const email = this.normalizeEmail(emailRaw);
    const user = await this.users.findOne({ where: { email } });
    const dummy = await this.dummyPasswordHash();
    const hash = user?.passwordHash || dummy;
    const match = await bcrypt.compare(password, hash);
    const locked = Boolean(
      user?.passwordLockedUntil && user.passwordLockedUntil.getTime() > Date.now(),
    );
    const staff = Boolean(user && user.isActive && user.passwordHash && isStaffRole(user.role));
    if (!staff || !match || locked) {
      if (staff && user && !locked) {
        const maxAttempts = this.num('app.passwordMaxAttempts', 5);
        user.passwordFailedAttempts = (user.passwordFailedAttempts ?? 0) + 1;
        if (user.passwordFailedAttempts >= maxAttempts) {
          user.passwordLockedUntil = new Date(
            Date.now() + this.num('app.passwordLockSeconds', 900) * 1000,
          );
          user.passwordFailedAttempts = 0;
        }
        await this.users.save(user);
      }
      throw new UnauthorizedException({
        error: locked ? 'PasswordAttemptsExceeded' : 'PasswordInvalid',
        message: locked ? 'Too many attempts.' : 'Sign-in could not be completed.',
      });
    }
    user!.passwordFailedAttempts = 0;
    user!.passwordLockedUntil = null;
    await this.users.save(user!);
    return this.issueSession(user!, meta, { purpose: 'staff' });
  }

  private async applyOwnerBootstrap(user: UserEntity, email: string): Promise<UserEntity> {
    if (this.bootstrapRoleFor(email) !== 'owner' || user.role === 'owner') return user;
    const previous = user.role;
    user.role = 'owner';
    const saved = await this.users.save(user);
    await this.auditRole(saved, previous, 'owner');
    return saved;
  }

  private bootstrapRoleFor(email: string): 'user' | 'admin' | 'owner' {
    const ownerBootstrap = this.configuredEmail('app.ownerBootstrapEmail');
    const adminBootstrap = this.configuredEmail('app.adminBootstrapEmail');
    if (ownerBootstrap && email === ownerBootstrap) return 'owner';
    if (adminBootstrap && email === adminBootstrap) return 'admin';
    return 'user';
  }

  private canIssueOwnerCode(user: UserEntity, email: string): boolean {
    if (!user.isActive) return false;
    if (isStaffRole(user.role)) return true;
    return this.bootstrapRoleFor(email) === 'owner';
  }

  private async latestOwnerCode(email: string): Promise<LoginCodeEntity | null> {
    return this.loginCodes.findOne({
      where: { email, consumedAt: IsNull() },
      order: { createdAt: 'DESC' },
    });
  }

  private async auditRole(
    user: UserEntity,
    from: string | null,
    to: 'owner',
  ): Promise<void> {
    await this.audit.record({
      action: 'user.role',
      actorUserId: user.id,
      actorType: 'owner',
      resourceType: 'user',
      resourceId: user.id,
      metadata: { from, to },
    });
  }

  private configuredEmail(key: string): string {
    return (this.config.get<string>(key) ?? '').trim().toLowerCase();
  }

  private ownerCodeTtl(): number {
    return this.num('app.ownerCodeTtlSeconds', 900);
  }

  private num(key: string, fallback: number): number {
    const value = Number(this.config.get<number>(key) ?? fallback);
    return Number.isFinite(value) ? value : fallback;
  }

  private emailRef(email: string): string {
    return crypto.createHash('sha256').update(email).digest('hex').slice(0, 12);
  }

  private passwordIsAcceptable(password: string, email: string): boolean {
    if (password.length < 12 || password.length > 128) return false;
    if (password.trim().toLowerCase() === email.trim().toLowerCase()) return false;
    return true;
  }

  private generateOwnerCode(length: number): string {
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let out = '';
    const bytes = crypto.randomBytes(length);
    for (let i = 0; i < length; i++) {
      out += alphabet[bytes[i] % alphabet.length];
    }
    return out;
  }

  private normalizeOwnerCode(raw: string): string {
    return raw.trim().toUpperCase().replace(/[\s-]/g, '');
  }

  private dummyHash: string | null = null;

  private async dummyPasswordHash(): Promise<string> {
    if (!this.dummyHash) {
      this.dummyHash = await bcrypt.hash(
        'namat-password-placeholder',
        this.num('app.passwordHashRounds', 12),
      );
    }
    return this.dummyHash;
  }

  private normalizeEmail(email: string): string {
    const e = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      throw new BadRequestException({
        error: 'InvalidEmail',
        message: 'Enter a valid email address.',
      });
    }
    return e;
  }

  private generateNumericCode(length: number): string {
    let out = '';
    for (let i = 0; i < length; i++) {
      out += crypto.randomInt(0, 10).toString();
    }
    return out;
  }

  private hashToken(raw: string): string {
    return crypto.createHash('sha256').update(raw).digest('hex');
  }

  private parseExpiry(expiresIn: string): Date {
    const m = /^(\d+)([smhd])$/.exec(expiresIn);
    if (!m) return new Date(Date.now() + 30 * 24 * 3600 * 1000);
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const mult =
      unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return new Date(Date.now() + n * mult);
  }
}
