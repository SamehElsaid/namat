import { execFileSync } from 'child_process';
import { createHash, randomBytes } from 'crypto';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { verifyAppAttest, decodeCbor, type AppAttestConfig } from './app-attest';

const TEAM = 'VT2LFN2C8U';
const BUNDLE = 'sa.shara.namat';

function sha256(b: Buffer): Buffer {
  return createHash('sha256').update(b).digest();
}

// --- tiny CBOR encoder for the test fixtures ---
function cborLen(major: number, len: number): Buffer {
  if (len < 24) return Buffer.from([(major << 5) | len]);
  if (len < 256) return Buffer.from([(major << 5) | 24, len]);
  const b = Buffer.from([(major << 5) | 25, 0, 0]);
  b.writeUInt16BE(len, 1);
  return b;
}
const cText = (s: string) => Buffer.concat([cborLen(3, Buffer.byteLength(s)), Buffer.from(s)]);
const cBytes = (b: Buffer) => Buffer.concat([cborLen(2, b.length), b]);
const cArray = (items: Buffer[]) => Buffer.concat([cborLen(4, items.length), ...items]);
function cMap(entries: [string, Buffer][]): Buffer {
  return Buffer.concat([cborLen(5, entries.length), ...entries.map(([k, v]) => Buffer.concat([cText(k), v]))]);
}

interface Fixture {
  keyId: string;
  attestationObject: string;
  challenge: Buffer;
  caPem: string;
}

/** Mint a real CA + leaf with the nonce extension and assemble a CBOR attestation. */
function buildFixture(opts?: { aaguid?: Buffer; tamperNonce?: boolean }): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'appattest-'));
  const run = (args: string[]) => execFileSync('openssl', args, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'ca.key']);
    run(['req', '-x509', '-new', '-key', 'ca.key', '-days', '1', '-subj', '/CN=Test AA CA', '-out', 'ca.crt']);
    run(['ecparam', '-name', 'prime256v1', '-genkey', '-noout', '-out', 'leaf.key']);
    run(['req', '-new', '-key', 'leaf.key', '-subj', '/CN=cred', '-out', 'leaf.csr']);

    // Public key point of the leaf → keyId.
    const leafPubDer = run(['ec', '-in', 'leaf.key', '-pubout', '-outform', 'DER']);
    // SubjectPublicKeyInfo ends with the BIT STRING: locate the 0x04 uncompressed point (65 bytes).
    const idx = leafPubDer.indexOf(Buffer.from([0x00, 0x04]));
    const point = leafPubDer.subarray(idx + 1, idx + 1 + 65);
    const keyId = sha256(point);

    const aaguid = opts?.aaguid ?? Buffer.from('appattestdevelop', 'latin1');
    const authData = Buffer.concat([
      sha256(Buffer.from(`${TEAM}.${BUNDLE}`)), // rpIdHash
      Buffer.from([0x00]), // flags
      Buffer.from([0, 0, 0, 0]), // signCount
      aaguid,
      Buffer.from([0x00, 0x20]), // credId length 32
      keyId, // credentialId
    ]);

    const challenge = randomBytes(24);
    const nonce = sha256(Buffer.concat([authData, sha256(challenge)]));
    const certNonce = opts?.tamperNonce ? sha256(Buffer.from('wrong')) : nonce;
    const extHex = Buffer.concat([Buffer.from('3024a1220420', 'hex'), certNonce]).toString('hex');
    writeFileSync(join(dir, 'ext.cnf'), `[v3]\n${'1.2.840.113635.100.8.2'} = DER:${extHex}\n`);

    run([
      'x509', '-req', '-in', 'leaf.csr', '-CA', 'ca.crt', '-CAkey', 'ca.key',
      '-CAcreateserial', '-days', '1', '-extfile', 'ext.cnf', '-extensions', 'v3',
      '-outform', 'DER', '-out', 'leaf.der',
    ]);
    const leafDer = readFileSync(join(dir, 'leaf.der'));
    const caPem = readFileSync(join(dir, 'ca.crt')).toString();

    const attestationObject = cMap([
      ['fmt', cText('apple-appattest')],
      ['attStmt', cMap([['x5c', cArray([cBytes(leafDer)])]])],
      ['authData', cBytes(authData)],
    ]);

    return { keyId: keyId.toString('base64'), attestationObject: attestationObject.toString('base64'), challenge, caPem };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function config(over: Partial<AppAttestConfig> = {}): AppAttestConfig {
  return { teamId: TEAM, bundleId: BUNDLE, rootCertsPem: [], allowDevelopment: true, ...over };
}

describe('verifyAppAttest', () => {
  it('accepts a well-formed attestation signed by the configured root', () => {
    const f = buildFixture();
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [f.caPem] }),
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.environment).toBe('development');
      expect(res.keyId).toBe(f.keyId);
      expect(res.publicKeyPem).toContain('BEGIN PUBLIC KEY');
    }
  });

  it('rejects when no root certificate is configured (fails closed)', () => {
    const f = buildFixture();
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [] }),
    );
    expect(res).toEqual({ ok: false, reason: 'root_unconfigured' });
  });

  it('rejects an untrusted chain', () => {
    const f = buildFixture();
    const other = buildFixture();
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [other.caPem] }),
    );
    expect(res.ok).toBe(false);
  });

  it('rejects a mismatched challenge', () => {
    const f = buildFixture();
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: Buffer.from('different') },
      config({ rootCertsPem: [f.caPem] }),
    );
    expect(res).toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  it('rejects a tampered nonce extension', () => {
    const f = buildFixture({ tamperNonce: true });
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [f.caPem] }),
    );
    expect(res).toEqual({ ok: false, reason: 'nonce_mismatch' });
  });

  it('rejects a key id that does not match the public key', () => {
    const f = buildFixture();
    const wrongKeyId = sha256(Buffer.from('not-the-key')).toString('base64');
    const res = verifyAppAttest(
      { keyId: wrongKeyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [f.caPem] }),
    );
    expect(res.ok).toBe(false);
  });

  it('rejects the development environment when it is not allowed', () => {
    const f = buildFixture();
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [f.caPem], allowDevelopment: false }),
    );
    expect(res).toEqual({ ok: false, reason: 'development_not_allowed' });
  });

  it('rejects an unknown aaguid', () => {
    const f = buildFixture({ aaguid: Buffer.from('xxxxxxxxxxxxxxxx', 'latin1') });
    const res = verifyAppAttest(
      { keyId: f.keyId, attestationObject: f.attestationObject, challenge: f.challenge },
      config({ rootCertsPem: [f.caPem] }),
    );
    expect(res).toEqual({ ok: false, reason: 'bad_aaguid' });
  });

  it('rejects malformed CBOR without throwing', () => {
    const res = verifyAppAttest(
      { keyId: Buffer.alloc(32).toString('base64'), attestationObject: 'bm90LWNib3I=', challenge: Buffer.from('x') },
      config({ rootCertsPem: ['-----BEGIN CERTIFICATE-----\nMA==\n-----END CERTIFICATE-----'] }),
    );
    expect(res.ok).toBe(false);
  });
});

describe('decodeCbor', () => {
  it('reads a small map with text, byte, array, and uint values', () => {
    const encoded = cMap([
      ['fmt', cText('apple-appattest')],
      ['n', Buffer.from([0x0a])], // uint 10
      ['b', cBytes(Buffer.from([1, 2, 3]))],
      ['a', cArray([cText('x'), cText('y')])],
    ]);
    const { value } = decodeCbor(encoded);
    expect(value).toBeInstanceOf(Map);
    const map = value as Map<unknown, unknown>;
    expect(map.get('fmt')).toBe('apple-appattest');
    expect(map.get('n')).toBe(10);
    expect(Buffer.isBuffer(map.get('b'))).toBe(true);
    expect(map.get('a')).toEqual(['x', 'y']);
  });
});
