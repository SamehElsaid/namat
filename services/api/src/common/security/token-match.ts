import { createHash, timingSafeEqual } from 'crypto';

/** Constant-time comparison so response timing does not leak the expected token. */
export function tokenMatches(candidate: string | null | undefined, expected: string): boolean {
  if (!candidate || !expected) return false;
  const a = createHash('sha256').update(candidate).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}
