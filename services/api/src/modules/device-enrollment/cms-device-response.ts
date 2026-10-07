import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { APPLE_IPHONE_DEVICE_CA_PEM } from './trust/apple-iphone-device-ca';

const MAX_CMS_BYTES = 2 * 1024 * 1024;

export interface SignerCertificateMetadata {
  subject: string;
  issuer: string;
  serial: string;
  fingerprintSha256: string;
  notBefore: string;
  notAfter: string;
}

export interface VerifiedDeviceCms {
  xml: string;
  signer: SignerCertificateMetadata;
  chain: SignerCertificateMetadata[];
}

export interface CmsDiagnostic {
  signatureIntact: true;
  signer: SignerCertificateMetadata;
  chain: SignerCertificateMetadata[];
}

export interface EnrollmentCmsVerifyOptions {
  trustBundlePem: string;
  allowLegacyIphoneDeviceCa: boolean;
  nodeEnv: string;
  /** Defaults to the archived 2014 Apple iPhone Device CA. Used only when the legacy flag is set. */
  legacyCaPem?: string;
}

/**
 * Enrollment acceptance trusts only the configured bundle.
 * Production refuses to continue when that bundle is missing.
 * The archived device CA is not added unless the legacy flag is set.
 */
export function assertEnrollmentTrustConfigured(
  options: Pick<EnrollmentCmsVerifyOptions, 'trustBundlePem' | 'nodeEnv'>,
): void {
  if (options.nodeEnv === 'production' && !options.trustBundlePem.trim()) {
    throw new Error('cms_trust_missing');
  }
}

/**
 * Verifies a Profile Service device identification response against an
 * explicit trust bundle. System trust stores are not used. `-noverify` is
 * not used. Certificate time is checked. The expired legacy device CA is a
 * separate attempt, and only when explicitly enabled.
 */
export function verifyDeviceCms(
  body: Buffer,
  options: EnrollmentCmsVerifyOptions,
): VerifiedDeviceCms {
  assertCmsBody(body);
  const bundle = options.trustBundlePem.trim();
  assertEnrollmentTrustConfigured(options);
  const allowLegacy = options.allowLegacyIphoneDeviceCa === true;
  if (!bundle && !allowLegacy) throw new Error('cms_trust_missing');

  if (bundle) {
    try {
      return verifyAgainstTrust(body, bundle, false);
    } catch (err) {
      if (!allowLegacy) rethrowCms(err);
    }
  } else if (options.nodeEnv === 'production') {
    throw new Error('cms_trust_missing');
  }

  if (!allowLegacy) throw new Error('cms_trust_missing');
  const legacy = (options.legacyCaPem ?? APPLE_IPHONE_DEVICE_CA_PEM).trim();
  if (!legacy.includes('BEGIN CERTIFICATE')) throw new Error('cms_trust_missing');
  return verifyAgainstTrust(body, legacy, true);
}

/**
 * Checks that the CMS signature matches the embedded signer certificate.
 * The signer is not treated as a trusted Apple device. The plist payload is
 * discarded. This must not be used to accept an enrollment.
 */
export function inspectUntrustedCms(body: Buffer): CmsDiagnostic {
  assertCmsBody(body);
  const dir = mkdtempSync(join(tmpdir(), 'namat-cms-diag-'));
  try {
    const bodyPath = join(dir, 'body.der');
    const payloadPath = join(dir, 'payload.bin');
    const certsPath = join(dir, 'certs.pem');
    writeFileSync(bodyPath, body, { mode: 0o600 });
    execFileSync(
      'openssl',
      [
        'cms',
        '-verify',
        '-inform',
        'DER',
        '-in',
        bodyPath,
        '-noverify',
        '-no-CApath',
        '-no-CAstore',
        '-certsout',
        certsPath,
        '-out',
        payloadPath,
      ],
      { stdio: 'pipe' },
    );
    const chain = readCertificateMetadata(readFileSync(certsPath, 'utf8'));
    if (chain.length === 0) throw new Error('cms_signer_rejected');
    return { signatureIntact: true, signer: chain[0], chain };
  } catch (err) {
    rethrowCms(err);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function verifyAgainstTrust(
  body: Buffer,
  trustPem: string,
  ignoreTime: boolean,
): VerifiedDeviceCms {
  const dir = mkdtempSync(join(tmpdir(), 'namat-cms-'));
  try {
    const trustPath = join(dir, 'trust.pem');
    const bodyPath = join(dir, 'body.der');
    const payloadPath = join(dir, 'payload.xml');
    const signerPath = join(dir, 'signer.pem');
    writeFileSync(trustPath, trustPem, { mode: 0o600 });
    writeFileSync(bodyPath, body, { mode: 0o600 });
    const args = [
      'cms',
      '-verify',
      '-inform',
      'DER',
      '-in',
      bodyPath,
      '-CAfile',
      trustPath,
      '-no-CApath',
      '-no-CAstore',
      '-purpose',
      'any',
      '-certsout',
      signerPath,
      '-out',
      payloadPath,
    ];
    if (ignoreTime) args.push('-no_check_time');
    execFileSync('openssl', args, { stdio: 'pipe' });
    const xml = readFileSync(payloadPath, 'utf8');
    if (!xml.trimStart().startsWith('<?xml') && !xml.trimStart().startsWith('<plist')) {
      throw new Error('cms_payload_invalid');
    }
    const chain = readCertificateMetadata(readFileSync(signerPath, 'utf8'));
    const signer = chain[0];
    if (!signer) throw new Error('cms_signer_rejected');
    if (normalizeDn(signer.issuer) === normalizeDn(signer.subject)) {
      throw new Error('cms_signer_rejected');
    }
    return { xml, signer, chain };
  } catch (err) {
    rethrowCms(err);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function readCertificateMetadata(pemBundle: string): SignerCertificateMetadata[] {
  const blocks = pemBundle.match(
    /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g,
  );
  if (!blocks) return [];
  return blocks.map((pem) => describeCertificate(pem));
}

function describeCertificate(pem: string): SignerCertificateMetadata {
  const dir = mkdtempSync(join(tmpdir(), 'namat-cert-'));
  try {
    const path = join(dir, 'cert.pem');
    writeFileSync(path, pem, { mode: 0o600 });
    const subject = opensslText(['x509', '-in', path, '-noout', '-subject']);
    const issuer = opensslText(['x509', '-in', path, '-noout', '-issuer']);
    const serial = opensslText(['x509', '-in', path, '-noout', '-serial']).replace(
      /^serial=/i,
      '',
    );
    const fingerprint = opensslText([
      'x509',
      '-in',
      path,
      '-noout',
      '-fingerprint',
      '-sha256',
    ])
      .replace(/^SHA256 Fingerprint=/i, '')
      .replace(/:/g, '')
      .toLowerCase();
    const dates = opensslText(['x509', '-in', path, '-noout', '-dates']);
    const notBefore = dates.match(/notBefore=(.*)/)?.[1]?.trim() ?? '';
    const notAfter = dates.match(/notAfter=(.*)/)?.[1]?.trim() ?? '';
    if (!subject || !issuer || !serial || !/^[0-9a-f]{64}$/.test(fingerprint)) {
      throw new Error('cms_signer_rejected');
    }
    return { subject, issuer, serial, fingerprintSha256: fingerprint, notBefore, notAfter };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function assertCmsBody(body: Buffer): void {
  if (!Buffer.isBuffer(body) || body.length < 16 || body.length > MAX_CMS_BYTES) {
    throw new Error('cms_required');
  }
  if (body[0] !== 0x30) throw new Error('cms_required');
}

function opensslText(args: string[]): string {
  return execFileSync('openssl', args, { stdio: 'pipe' }).toString('utf8').trim();
}

function normalizeDn(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function rethrowCms(err: unknown): never {
  if (err instanceof Error && err.message.startsWith('cms_')) throw err;
  throw new Error('cms_verify_failed');
}
