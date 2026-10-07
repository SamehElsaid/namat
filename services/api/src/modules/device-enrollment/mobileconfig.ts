import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function assertHttpsCallback(url: string, nodeEnv: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('enrollment_callback_url_invalid');
  }
  if (parsed.protocol !== 'https:' && nodeEnv === 'production') {
    throw new Error('enrollment_callback_must_be_https');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('enrollment_callback_url_invalid');
  }
}

/** Profile Service payload. Requests only UDID, product, and iOS version. */
export function buildEnrollmentProfile(input: {
  callbackUrl: string;
  nodeEnv: string;
  challenge: string;
}): string {
  assertHttpsCallback(input.callbackUrl, input.nodeEnv);
  if (!input.challenge || /[<>&"']/.test(input.challenge)) {
    throw new Error('enrollment_challenge_missing');
  }
  const description =
    'Registers this iPhone with your NAMAT purchase. NAMAT receives only the device identifier, model, and iOS version needed to prepare installation. Card numbers and Wallet data are not collected. تسجيل هذا iPhone مع شراء نَمَط. يُرسل معرّف الجهاز والطراز وإصدار iOS فقط.';
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <dict>
    <key>URL</key>
    <string>${escapeXml(input.callbackUrl)}</string>
    <key>DeviceAttributes</key>
    <array>
      <string>UDID</string>
      <string>PRODUCT</string>
      <string>VERSION</string>
    </array>
    <key>Challenge</key>
    <string>${escapeXml(input.challenge)}</string>
  </dict>
  <key>PayloadOrganization</key>
  <string>NAMAT</string>
  <key>PayloadDisplayName</key>
  <string>NAMAT</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadUUID</key>
  <string>${randomUUID()}</string>
  <key>PayloadIdentifier</key>
  <string>sa.shara.namat.enroll</string>
  <key>PayloadDescription</key>
  <string>${escapeXml(description)}</string>
  <key>PayloadType</key>
  <string>Profile Service</string>
</dict>
</plist>
`;
}

export function buildConfirmationProfile(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array/>
  <key>PayloadOrganization</key>
  <string>NAMAT</string>
  <key>PayloadDisplayName</key>
  <string>NAMAT</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadUUID</key>
  <string>${randomUUID()}</string>
  <key>PayloadIdentifier</key>
  <string>sa.shara.namat.enroll.done</string>
  <key>PayloadDescription</key>
  <string>Device registered. Return to Safari. تم تسجيل الجهاز. ارجع إلى Safari.</string>
  <key>PayloadType</key>
  <string>Configuration</string>
</dict>
</plist>
`;
}

export function buildInstallManifest(input: {
  ipaUrl: string;
  bundleVersion: string;
}): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>items</key>
  <array>
    <dict>
      <key>assets</key>
      <array>
        <dict>
          <key>kind</key>
          <string>software-package</string>
          <key>url</key>
          <string>${escapeXml(input.ipaUrl)}</string>
        </dict>
      </array>
      <key>metadata</key>
      <dict>
        <key>bundle-identifier</key>
        <string>sa.shara.namat.app</string>
        <key>bundle-version</key>
        <string>${escapeXml(input.bundleVersion || '1.0.0')}</string>
        <key>kind</key>
        <string>software</string>
        <key>title</key>
        <string>NAMAT</string>
      </dict>
    </dict>
  </array>
</dict>
</plist>
`;
}

/**
 * Signs a profile when PEM material is configured. Returns null when signing
 * material is absent or openssl fails, so the caller can serve the unsigned
 * profile. Secrets are written only to a temporary directory and deleted.
 */
export function signMobileconfig(
  xml: string,
  certPem: string,
  keyPem: string,
): Buffer | null {
  if (!certPem.trim() || !keyPem.trim()) return null;
  const dir = mkdtempSync(join(tmpdir(), 'namat-profile-'));
  try {
    const profilePath = join(dir, 'profile.mobileconfig');
    const certPath = join(dir, 'cert.pem');
    const keyPath = join(dir, 'key.pem');
    const outPath = join(dir, 'signed.der');
    writeFileSync(profilePath, xml);
    writeFileSync(certPath, certPem);
    writeFileSync(keyPath, keyPem);
    execFileSync(
      'openssl',
      [
        'smime',
        '-sign',
        '-signer',
        certPath,
        '-inkey',
        keyPath,
        '-nodetach',
        '-outform',
        'der',
        '-in',
        profilePath,
        '-out',
        outPath,
      ],
      { stdio: 'ignore' },
    );
    return readFileSync(outPath);
  } catch {
    return null;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
