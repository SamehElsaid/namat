import { createHash, X509Certificate } from 'crypto';

/**
 * Apple App Attest verification.
 *
 * Implements the attestation checks from Apple's "Validating Apps That Connect
 * to Your Server" (DCAppAttestService). It is intentionally self-contained: a
 * tiny CBOR reader for the attestation object plus manual authenticator-data
 * and certificate-extension parsing, so it adds no dependency.
 *
 * It fails closed. Any missing field, parse error, or mismatch returns
 * { ok: false }; a caller must treat anything but ok:true as a rejection and
 * must never grant on a thrown error either.
 *
 * What this code cannot prove without a real device and Apple's published root
 * CA is that a given blob came from a genuine Secure Enclave. That is why the
 * caller gates the whole feature behind NAMAT_REQUIRE_APP_ATTEST and supplies
 * the root certificate; with no root configured, verification rejects.
 */

// DER of the OID 1.2.840.113635.100.8.2 as it appears inside a certificate.
const NONCE_OID_DER = Buffer.from([
  0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x63, 0x64, 0x08, 0x02,
]);

const AAGUID_PROD = Buffer.from('appattest\0\0\0\0\0\0\0', 'latin1');
const AAGUID_DEV = Buffer.from('appattestdevelop', 'latin1');

export interface AppAttestInput {
  /** Base64 of the key identifier returned by attestKey (SHA-256 of the public key). */
  keyId: string;
  /** Base64 of the CBOR attestation object. */
  attestationObject: string;
  /** The exact server challenge bytes the app hashed as clientDataHash. */
  challenge: Buffer;
}

export interface AppAttestConfig {
  teamId: string;
  bundleId: string;
  /** Apple App Attest root CA certificate(s), PEM. Empty means verification rejects. */
  rootCertsPem: string[];
  /** Accept the development attestation environment (aaguid "appattestdevelop"). */
  allowDevelopment: boolean;
}

export type AppAttestResult =
  | {
      ok: true;
      publicKeyPem: string;
      keyId: string;
      environment: 'production' | 'development';
      signCount: number;
    }
  | { ok: false; reason: string };

export function verifyAppAttest(input: AppAttestInput, config: AppAttestConfig): AppAttestResult {
  try {
    return verifyInner(input, config);
  } catch {
    return { ok: false, reason: 'parse_error' };
  }
}

function verifyInner(input: AppAttestInput, config: AppAttestConfig): AppAttestResult {
  if (!config.rootCertsPem.length) return { ok: false, reason: 'root_unconfigured' };
  if (!config.teamId || !config.bundleId) return { ok: false, reason: 'app_unconfigured' };

  let keyIdBuf: Buffer;
  try {
    keyIdBuf = Buffer.from(input.keyId, 'base64');
  } catch {
    return { ok: false, reason: 'bad_key_id' };
  }
  if (keyIdBuf.length !== 32) return { ok: false, reason: 'bad_key_id' };

  const object = decodeCbor(Buffer.from(input.attestationObject, 'base64')).value as
    | Map<unknown, unknown>
    | undefined;
  if (!(object instanceof Map)) return { ok: false, reason: 'bad_attestation' };

  if (object.get('fmt') !== 'apple-appattest') return { ok: false, reason: 'bad_format' };
  const attStmt = object.get('attStmt');
  const authData = object.get('authData');
  if (!(attStmt instanceof Map) || !Buffer.isBuffer(authData)) {
    return { ok: false, reason: 'bad_attestation' };
  }
  const x5c = attStmt.get('x5c');
  if (!Array.isArray(x5c) || x5c.length < 1 || !x5c.every((c) => Buffer.isBuffer(c))) {
    return { ok: false, reason: 'missing_chain' };
  }

  // 1. Certificate chain up to a configured Apple root.
  const chain = (x5c as Buffer[]).map((der) => new X509Certificate(der));
  if (!verifyChain(chain, config.rootCertsPem)) return { ok: false, reason: 'chain_invalid' };
  const credCert = chain[0];

  // 2. nonce = SHA256(authData || SHA256(challenge)); must equal the credCert extension.
  const clientDataHash = sha256(input.challenge);
  const expectedNonce = sha256(Buffer.concat([authData, clientDataHash]));
  const certNonce = readNonceExtension(credCert.raw);
  if (!certNonce || !timingSafeEqualBuf(certNonce, expectedNonce)) {
    return { ok: false, reason: 'nonce_mismatch' };
  }

  // 3. keyId must be SHA256 of the credCert's uncompressed public key point.
  const point = publicKeyPoint(credCert);
  if (!point) return { ok: false, reason: 'bad_public_key' };
  if (!timingSafeEqualBuf(sha256(point), keyIdBuf)) {
    return { ok: false, reason: 'key_id_mismatch' };
  }

  // 4. Authenticator data: rpIdHash, counter, aaguid, credentialId.
  const auth = parseAuthData(authData);
  if (!auth) return { ok: false, reason: 'bad_auth_data' };

  const appIdHash = sha256(Buffer.from(`${config.teamId}.${config.bundleId}`, 'utf8'));
  if (!timingSafeEqualBuf(auth.rpIdHash, appIdHash)) {
    return { ok: false, reason: 'rp_id_mismatch' };
  }
  if (auth.signCount !== 0) return { ok: false, reason: 'bad_counter' };

  let environment: 'production' | 'development';
  if (auth.aaguid.equals(AAGUID_PROD)) {
    environment = 'production';
  } else if (auth.aaguid.equals(AAGUID_DEV)) {
    if (!config.allowDevelopment) return { ok: false, reason: 'development_not_allowed' };
    environment = 'development';
  } else {
    return { ok: false, reason: 'bad_aaguid' };
  }

  if (!timingSafeEqualBuf(auth.credentialId, keyIdBuf)) {
    return { ok: false, reason: 'credential_id_mismatch' };
  }

  return {
    ok: true,
    publicKeyPem: credCert.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    keyId: input.keyId,
    environment,
    signCount: auth.signCount,
  };
}

function verifyChain(chain: X509Certificate[], rootsPem: string[]): boolean {
  const now = Date.now();
  for (const cert of chain) {
    if (Number.isNaN(Date.parse(cert.validFrom)) || Number.isNaN(Date.parse(cert.validTo))) {
      return false;
    }
    if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) return false;
  }
  // Each cert must be signed by the next one in the chain.
  for (let i = 0; i < chain.length - 1; i += 1) {
    if (!chain[i].verify(chain[i + 1].publicKey)) return false;
  }
  // The chain's top must be signed by (or equal to) a configured root.
  const roots = rootsPem.map((pem) => new X509Certificate(pem));
  const top = chain[chain.length - 1];
  return roots.some((root) => {
    try {
      return top.verify(root.publicKey) || top.raw.equals(root.raw);
    } catch {
      return false;
    }
  });
}

/** Uncompressed P-256 point (0x04 || X || Y) from an EC certificate, or null. */
function publicKeyPoint(cert: X509Certificate): Buffer | null {
  const jwk = cert.publicKey.export({ format: 'jwk' }) as { kty?: string; x?: string; y?: string };
  if (jwk.kty !== 'EC' || !jwk.x || !jwk.y) return null;
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  if (x.length !== 32 || y.length !== 32) return null;
  return Buffer.concat([Buffer.from([0x04]), x, y]);
}

interface AuthData {
  rpIdHash: Buffer;
  signCount: number;
  aaguid: Buffer;
  credentialId: Buffer;
}

function parseAuthData(authData: Buffer): AuthData | null {
  // 32 rpIdHash | 1 flags | 4 signCount | 16 aaguid | 2 credIdLen | credId ...
  if (authData.length < 55) return null;
  const rpIdHash = authData.subarray(0, 32);
  const signCount = authData.readUInt32BE(33);
  const aaguid = authData.subarray(37, 53);
  const credIdLen = authData.readUInt16BE(53);
  if (authData.length < 55 + credIdLen) return null;
  const credentialId = authData.subarray(55, 55 + credIdLen);
  return { rpIdHash, signCount, aaguid, credentialId };
}

/**
 * Find the App Attest nonce extension (OID 1.2.840.113635.100.8.2) in a DER
 * certificate and return its 32-byte nonce. The extension value is an OCTET
 * STRING wrapping SEQUENCE { [1] ( OCTET STRING nonce ) }.
 */
function readNonceExtension(der: Buffer): Buffer | null {
  const at = der.indexOf(NONCE_OID_DER);
  if (at < 0) return null;
  let i = at + NONCE_OID_DER.length;
  // Optional BOOLEAN "critical" is not emitted for this extension; next is the
  // extnValue OCTET STRING. Skip its tag+length to reach the wrapped DER.
  if (der[i] !== 0x04) return null; // OCTET STRING (extnValue)
  i += 1;
  const outer = readDerLength(der, i);
  if (!outer) return null;
  i = outer.next;
  // Wrapped: SEQUENCE
  if (der[i] !== 0x30) return null;
  i += 1;
  const seq = readDerLength(der, i);
  if (!seq) return null;
  i = seq.next;
  // [1] context tag (constructed) 0xA1
  if (der[i] !== 0xa1) return null;
  i += 1;
  const ctx = readDerLength(der, i);
  if (!ctx) return null;
  i = ctx.next;
  // OCTET STRING nonce
  if (der[i] !== 0x04) return null;
  i += 1;
  const oct = readDerLength(der, i);
  if (!oct) return null;
  i = oct.next;
  if (oct.length !== 32) return null;
  if (i + 32 > der.length) return null;
  return der.subarray(i, i + 32);
}

function readDerLength(buf: Buffer, offset: number): { length: number; next: number } | null {
  if (offset >= buf.length) return null;
  const first = buf[offset];
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 4 || offset + 1 + count > buf.length) return null;
  let length = 0;
  for (let j = 0; j < count; j += 1) length = (length << 8) | buf[offset + 1 + j];
  return { length, next: offset + 1 + count };
}

// --- Minimal CBOR reader (unsigned int, byte/text string, array, map) ---

interface CborRead {
  value: unknown;
  next: number;
}

export function decodeCbor(buf: Buffer, offset = 0): CborRead {
  if (offset >= buf.length) throw new Error('cbor_eof');
  const initial = buf[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  const head = readCborLength(buf, offset + 1, info);
  const len = head.value;
  let i = head.next;

  switch (major) {
    case 0: // unsigned integer
      return { value: len, next: i };
    case 2: {
      // byte string
      const end = i + len;
      if (end > buf.length) throw new Error('cbor_eof');
      return { value: buf.subarray(i, end), next: end };
    }
    case 3: {
      // text string
      const end = i + len;
      if (end > buf.length) throw new Error('cbor_eof');
      return { value: buf.subarray(i, end).toString('utf8'), next: end };
    }
    case 4: {
      // array
      const arr: unknown[] = [];
      for (let k = 0; k < len; k += 1) {
        const item = decodeCbor(buf, i);
        arr.push(item.value);
        i = item.next;
      }
      return { value: arr, next: i };
    }
    case 5: {
      // map
      const map = new Map<unknown, unknown>();
      for (let k = 0; k < len; k += 1) {
        const key = decodeCbor(buf, i);
        const val = decodeCbor(buf, key.next);
        map.set(key.value, val.value);
        i = val.next;
      }
      return { value: map, next: i };
    }
    default:
      throw new Error(`cbor_unsupported_major_${major}`);
  }
}

function readCborLength(buf: Buffer, offset: number, info: number): { value: number; next: number } {
  if (info < 24) return { value: info, next: offset };
  if (info === 24) return { value: buf[offset], next: offset + 1 };
  if (info === 25) return { value: buf.readUInt16BE(offset), next: offset + 2 };
  if (info === 26) return { value: buf.readUInt32BE(offset), next: offset + 4 };
  if (info === 27) {
    const big = buf.readBigUInt64BE(offset);
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('cbor_length_too_large');
    return { value: Number(big), next: offset + 8 };
  }
  throw new Error('cbor_bad_length');
}

function sha256(buf: Buffer): Buffer {
  return createHash('sha256').update(buf).digest();
}

function timingSafeEqualBuf(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a[i] ^ b[i];
  return diff === 0;
}
