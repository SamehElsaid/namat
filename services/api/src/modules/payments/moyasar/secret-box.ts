import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'crypto';

const VERSION = 'v1';

/**
 * SHA-256 of PAYMENT_CONFIG_KEY. The key itself is never stored.
 * Length is only a floor. A 16-character string is not accepted, and a
 * 32-character password is not proof of 256-bit entropy. Operators must
 * set a random secret, for example `openssl rand -base64 32`.
 */
export function paymentConfigKey(raw: string | undefined): Buffer | null {
  const value = (raw ?? '').trim();
  if (value.length < 32) return null;
  if (new Set(value).size < 8) return null;
  return createHash('sha256').update(value, 'utf8').digest();
}

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.');
}

export function decryptSecret(payload: string, key: Buffer): string | null {
  const [version, ivB64, tagB64, dataB64] = payload.split('.');
  if (version !== VERSION || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch {
    return null;
  }
}

export function secretsEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
