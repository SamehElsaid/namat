import { createHash, createPublicKey, createVerify, KeyObject } from 'crypto';
import { BadRequestException } from '@nestjs/common';

/** Uncompressed P-256 point: 0x04 || X || Y. */
export function parseP256Point(encoded: string): Buffer {
  const raw = Buffer.from(encoded.trim(), 'base64');
  if (raw.length !== 65 || raw[0] !== 0x04) {
    throw new BadRequestException({
      error: 'DeviceKeyInvalid',
      message: 'Device activation could not be verified.',
    });
  }
  return raw;
}

export function fingerprintP256Point(encoded: string): string {
  const raw = parseP256Point(encoded);
  return createHash('sha256').update(raw).digest('hex');
}

export function p256KeyFromPoint(encoded: string): KeyObject {
  const raw = parseP256Point(encoded);
  const x = raw.subarray(1, 33).toString('base64url');
  const y = raw.subarray(33).toString('base64url');
  return createPublicKey({
    key: { kty: 'EC', crv: 'P-256', x, y },
    format: 'jwk',
  });
}

export function verifyP256Signature(
  encodedPoint: string,
  nonce: string,
  signatureBase64: string,
): boolean {
  let signature: Buffer;
  try {
    signature = Buffer.from(signatureBase64, 'base64');
  } catch {
    return false;
  }
  if (!signature.length || signature.length > 128) return false;
  try {
    const key = p256KeyFromPoint(encodedPoint);
    const verifier = createVerify('SHA256');
    verifier.update(nonce);
    verifier.end();
    return verifier.verify(key, signature);
  } catch {
    return false;
  }
}

export function hashNonce(nonce: string): string {
  return createHash('sha256').update(nonce).digest('hex');
}
