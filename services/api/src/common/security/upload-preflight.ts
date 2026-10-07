import { AuthUser, isStaffRole } from '../decorators/auth.decorators';
import { SESSION_COOKIE } from '../../modules/auth/session-cookie';
import { tokenMatches } from './token-match';

type Headers = Record<string, string | string[] | undefined>;

export type LargeUploadKind = 'signing-artifact' | 'stable-payload';

export interface UploadPreflightDeps {
  signingCallbackToken: string;
  adminApiToken: string;
  validateAccessToken: (token: string) => Promise<AuthUser>;
}

/**
 * The large-upload routes buffer up to SIGNED_IPA_MAX_BYTES before the route
 * guards run. This check runs first, so an unauthenticated caller is refused
 * before any of the body is read.
 */
export async function authorizeLargeUpload(
  kind: LargeUploadKind,
  headers: Headers,
  deps: UploadPreflightDeps,
): Promise<boolean> {
  const bearer = bearerToken(headers);
  if (kind === 'signing-artifact') {
    return tokenMatches(bearer, deps.signingCallbackToken);
  }

  if (tokenMatches(bearer, deps.adminApiToken)) return true;
  const cookie = bearer ? null : sessionCookie(headers);
  // A cookie session needs the same CSRF header the auth guard requires.
  if (cookie && header(headers, 'x-namat-request') !== '1') return false;
  const token = bearer ?? cookie;
  if (!token) return false;
  try {
    const user = await deps.validateAccessToken(token);
    return user.purpose === 'staff' && isStaffRole(user.role);
  } catch {
    return false;
  }
}

function header(headers: Headers, name: string): string | undefined {
  const raw = headers[name];
  return Array.isArray(raw) ? raw[0] : raw;
}

function bearerToken(headers: Headers): string | null {
  const value = header(headers, 'authorization');
  if (!value?.toLowerCase().startsWith('bearer ')) return null;
  return value.slice(7).trim() || null;
}

function sessionCookie(headers: Headers): string | null {
  const raw = headers['cookie'];
  const value = Array.isArray(raw) ? raw.join(';') : raw;
  if (!value) return null;
  for (const part of value.split(';')) {
    const [key, ...rest] = part.trim().split('=');
    if (key === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}
