import type { Response } from 'express';

export const SESSION_COOKIE = 'namat_session';

export function setSessionCookie(
  res: Response,
  token: string,
  secure: boolean,
  maxAgeMs = 30 * 24 * 60 * 60 * 1000,
): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: maxAgeMs,
  });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
  });
}
