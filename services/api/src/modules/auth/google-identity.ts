import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client, TokenPayload } from 'google-auth-library';

export const GOOGLE_ISSUERS = [
  'accounts.google.com',
  'https://accounts.google.com',
] as const;

export interface VerifiedGoogleIdentity {
  provider: 'google';
  subject: string;
  email: string;
  emailVerified: true;
}

/**
 * Claim checks after the Google library has verified the signature.
 * Identity comes only from the token payload.
 */
export function assertGoogleIdentity(
  payload: TokenPayload | undefined,
  audience: string,
): VerifiedGoogleIdentity {
  if (!payload) {
    throw invalid();
  }
  const issuers: readonly string[] = GOOGLE_ISSUERS;
  if (!payload.iss || !issuers.includes(payload.iss)) {
    throw invalid();
  }
  const aud = payload.aud;
  const audiences = Array.isArray(aud) ? aud : aud ? [aud] : [];
  if (!audience || !audiences.includes(audience)) {
    throw invalid();
  }
  const exp = Number(payload.exp);
  if (!Number.isFinite(exp) || exp * 1000 <= Date.now()) {
    throw invalid();
  }
  const subject = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  if (!subject || subject.length > 255 || /\s/.test(subject)) {
    throw invalid();
  }
  const email = normalizeGoogleEmail(payload.email);
  if (!email) {
    throw invalid();
  }
  if (payload.email_verified !== true) {
    throw new UnauthorizedException({
      error: 'GoogleEmailUnverified',
      message: 'Google sign-in could not be verified.',
    });
  }
  return {
    provider: 'google',
    subject,
    email,
    emailVerified: true,
  };
}

function normalizeGoogleEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
    return null;
  }
  return email;
}

function invalid(): UnauthorizedException {
  return new UnauthorizedException({
    error: 'GoogleTokenInvalid',
    message: 'Google sign-in could not be verified.',
  });
}

@Injectable()
export class GoogleTokenVerifier {
  private readonly audience: string;
  private readonly client = new OAuth2Client();

  constructor(config: ConfigService) {
    this.audience = (
      config.get<string>('app.googleServerClientId') ?? ''
    ).trim();
  }

  /**
   * Verifies a Google ID token with Google's published certificates.
   * The thrown error never includes the token.
   */
  async verify(idToken: string): Promise<VerifiedGoogleIdentity> {
    this.assertConfigured();
    try {
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.audience,
      });
      return assertGoogleIdentity(ticket.getPayload(), this.audience);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw invalid();
    }
  }

  /**
   * Same claim and signature checks, using caller-supplied certificates.
   * Tests use a locally generated key. Production uses {@link verify}.
   */
  async verifyAgainstCerts(
    idToken: string,
    certs: Record<string, string>,
  ): Promise<VerifiedGoogleIdentity> {
    this.assertConfigured();
    try {
      const ticket = await this.client.verifySignedJwtWithCertsAsync(
        idToken,
        certs,
        this.audience,
        [...GOOGLE_ISSUERS],
      );
      return assertGoogleIdentity(ticket.getPayload(), this.audience);
    } catch (err) {
      if (err instanceof UnauthorizedException) throw err;
      throw invalid();
    }
  }

  private assertConfigured(): void {
    if (!this.audience) {
      throw new ServiceUnavailableException({
        error: 'GoogleNotConfigured',
        message: 'Google sign-in is unavailable.',
      });
    }
  }
}
