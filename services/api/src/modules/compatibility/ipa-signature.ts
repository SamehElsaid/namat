import { createHash, createPrivateKey, createPublicKey, createSign, createVerify, KeyObject } from 'crypto';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface IpaVerification {
  verified: boolean;
  reason: string;
  sha256: string;
  bundleId: string | null;
  executable: string | null;
  profileExpiresAt: string | null;
}

export interface IpaAttestation {
  sha256: string;
  bundleId: string;
  executable: string;
  profileExpiresAt: string;
  distribution: true;
  reason: 'codesign_distribution';
  signature: string;
}

/**
 * Publication requires the extracted app, its nested executable, and a
 * non-expired customer provisioning profile. codesign --verify alone is not
 * enough, and a missing verifier stays unpublished.
 * The SHA-256 is the exact bytes being published.
 */
export async function verifyIpaSignature(bytes: Buffer): Promise<IpaVerification> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const empty = {
    verified: false,
    sha256,
    bundleId: null,
    executable: null,
    profileExpiresAt: null,
  };
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    return { ...empty, reason: 'not_a_zip' };
  }
  let codesign = true;
  try {
    await execFileAsync('codesign', ['--version']);
  } catch {
    codesign = false;
  }
  if (!codesign) return { ...empty, reason: 'verifier_unavailable' };

  const dir = await mkdtemp(join(tmpdir(), 'namat-ipa-'));
  const unpacked = join(dir, 'unpacked');
  try {
    await writeFile(join(dir, 'app.ipa'), bytes);
    await execFileAsync('unzip', ['-q', join(dir, 'app.ipa'), '-d', unpacked]);
    const app = await findAppBundle(unpacked);
    if (!app) return { ...empty, reason: 'app_bundle_missing' };
    const info = await readText(join(app, 'Info.plist'));
    const executable = plistString(info, 'CFBundleExecutable');
    const bundleId = plistString(info, 'CFBundleIdentifier');
    if (!executable || !bundleId) {
      return { ...empty, reason: 'bundle_metadata_missing', bundleId, executable };
    }
    await execFileAsync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
    await execFileAsync('codesign', ['--verify', '--strict', '--verbose=2', join(app, executable)]);
    const xml = await decodeProvisioning(join(app, 'embedded.mobileprovision'));
    const profile = assessProvisioningProfile(xml);
    if (!profile.ok) {
      return {
        ...empty,
        reason: profile.reason,
        bundleId,
        executable,
        profileExpiresAt: profile.expiresAt,
      };
    }
    return {
      verified: true,
      reason: 'codesign_distribution',
      sha256,
      bundleId,
      executable,
      profileExpiresAt: profile.expiresAt,
    };
  } catch {
    return { ...empty, reason: 'codesign_failed' };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Customer distribution: unexpired profile, not a development get-task-allow profile, and devices or enterprise. */
export function assessProvisioningProfile(xml: string, now = new Date()): {
  ok: boolean;
  reason: string;
  expiresAt: string | null;
  bundleId: string | null;
} {
  const expiresAt = plistString(xml, 'ExpirationDate', 'date');
  const bundleId = plistString(xml, 'application-identifier');
  const expiresMs = expiresAt ? Date.parse(expiresAt) : Number.NaN;
  if (!expiresAt || Number.isNaN(expiresMs) || expiresMs <= now.getTime()) {
    return { ok: false, reason: 'profile_expired', expiresAt, bundleId };
  }
  if (plistBool(xml, 'get-task-allow') === true) {
    return { ok: false, reason: 'development_profile', expiresAt, bundleId };
  }
  const enterprise = plistBool(xml, 'ProvisionsAllDevices') === true;
  if (!enterprise && provisionedDeviceCount(xml) < 1) {
    return { ok: false, reason: 'not_customer_distribution', expiresAt, bundleId };
  }
  if (!bundleId) return { ok: false, reason: 'bundle_metadata_missing', expiresAt, bundleId };
  return { ok: true, reason: 'codesign_distribution', expiresAt, bundleId };
}

export function attestationPayload(input: {
  sha256: string;
  bundleId: string;
  executable: string;
  profileExpiresAt: string;
}): string {
  return JSON.stringify({
    bundleId: input.bundleId,
    distribution: true,
    executable: input.executable,
    profileExpiresAt: input.profileExpiresAt,
    reason: 'codesign_distribution',
    sha256: input.sha256,
  });
}

export function signIpaAttestation(
  input: {
    sha256: string;
    bundleId: string;
    executable: string;
    profileExpiresAt: string;
  },
  privateKeyPem: string,
): IpaAttestation {
  const signature = createSign('SHA256')
    .update(attestationPayload(input))
    .end()
    .sign(createPrivateKey(privateKeyPem))
    .toString('base64');
  return { ...input, distribution: true, reason: 'codesign_distribution', signature };
}

/** A signature over the IPA SHA-256. An owner boolean is not accepted. */
export function verifyIpaAttestation(
  attestation: IpaAttestation,
  publicKeyPem: string,
  ipaSha256: string,
  now = new Date(),
): { ok: boolean; reason: string } {
  if (!publicKeyPem.trim()) return { ok: false, reason: 'attestation_unconfigured' };
  if (attestation.reason !== 'codesign_distribution' || attestation.distribution !== true) {
    return { ok: false, reason: 'attestation_rejected' };
  }
  if (!attestation.sha256 || attestation.sha256 !== ipaSha256) {
    return { ok: false, reason: 'sha256_mismatch' };
  }
  if (!attestation.bundleId || !attestation.executable) {
    return { ok: false, reason: 'bundle_metadata_missing' };
  }
  const expiresMs = Date.parse(attestation.profileExpiresAt);
  if (Number.isNaN(expiresMs) || expiresMs <= now.getTime()) {
    return { ok: false, reason: 'profile_expired' };
  }
  let key: KeyObject;
  try {
    key = createPublicKey(publicKeyPem);
  } catch {
    return { ok: false, reason: 'attestation_unconfigured' };
  }
  const valid = createVerify('SHA256')
    .update(attestationPayload(attestation))
    .end()
    .verify(key, Buffer.from(attestation.signature, 'base64'));
  return valid
    ? { ok: true, reason: 'attested_distribution' }
    : { ok: false, reason: 'attestation_rejected' };
}

function plistString(xml: string, key: string, valueTag: 'string' | 'date' = 'string'): string | null {
  const match = xml.match(new RegExp(`<key>${key}</key>\\s*<${valueTag}>([^<]*)</${valueTag}>`));
  return match?.[1]?.trim() || null;
}

function plistBool(xml: string, key: string): boolean | null {
  const match = xml.match(new RegExp(`<key>${key}</key>\\s*<(true|false)\\s*/>`));
  if (!match) return null;
  return match[1] === 'true';
}

function provisionedDeviceCount(xml: string): number {
  const block = xml.match(/<key>ProvisionedDevices<\/key>\s*<array>([\s\S]*?)<\/array>/);
  if (!block) return 0;
  return [...block[1].matchAll(/<string>[^<]+<\/string>/g)].length;
}

async function findAppBundle(root: string): Promise<string | null> {
  const { readdir } = await import('fs/promises');
  const payload = join(root, 'Payload');
  let names: string[];
  try {
    names = await readdir(payload);
  } catch {
    return null;
  }
  const app = names.find((name) => name.endsWith('.app'));
  return app ? join(payload, app) : null;
}

async function readText(path: string): Promise<string> {
  const { readFile } = await import('fs/promises');
  try {
    return await readFile(path, 'utf8');
  } catch {
    return '';
  }
}

async function decodeProvisioning(path: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('security', ['cms', '-D', '-i', path]);
    if (stdout.includes('<plist')) return stdout;
  } catch {
    // security cms is the macOS path. OpenSSL is the fallback.
  }
  const { stdout } = await execFileAsync('openssl', [
    'smime',
    '-verify',
    '-inform',
    'DER',
    '-noverify',
    '-in',
    path,
  ]);
  return stdout;
}
