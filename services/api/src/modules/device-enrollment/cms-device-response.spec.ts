import { APPLE_IPHONE_DEVICE_CA_PEM } from './trust/apple-iphone-device-ca';
import {
  assertEnrollmentTrustConfigured,
  inspectUntrustedCms,
  verifyDeviceCms,
} from './cms-device-response';
import { DeviceCmsFixture } from './cms-test-fixture';
import { parseVerifiedDevicePlist } from './plist';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
<key>UDID</key><string>00008020-001A2B3C4D5E6F78</string>
<key>CHALLENGE</key><string>expected-challenge</string>
<key>PRODUCT</key><string>iPhone15,2</string>
<key>VERSION</key><string>17.5</string>
</dict></plist>`;

describe('Profile Service CMS verification', () => {
  const fixture = new DeviceCmsFixture();

  afterAll(() => fixture.dispose());

  it('extracts the plist only after the signer chains to the configured bundle', () => {
    const verified = verifyDeviceCms(fixture.sign(XML), {
      trustBundlePem: fixture.caPem,
      allowLegacyIphoneDeviceCa: false,
      nodeEnv: 'test',
    });
    expect(verified.signer.issuer).toContain('Test Device CA');
    expect(verified.signer.subject).toContain('Test iPhone');
    expect(verified.signer.fingerprintSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(parseVerifiedDevicePlist(verified.xml).challenge).toBe('expected-challenge');
  });

  it('rejects a raw XML body and an untrusted signer', () => {
    expect(() =>
      verifyDeviceCms(Buffer.from(XML), {
        trustBundlePem: fixture.caPem,
        allowLegacyIphoneDeviceCa: false,
        nodeEnv: 'production',
      }),
    ).toThrow(/cms_required/);
    expect(() =>
      verifyDeviceCms(fixture.signWithUntrustedCa(XML), {
        trustBundlePem: fixture.caPem,
        allowLegacyIphoneDeviceCa: false,
        nodeEnv: 'production',
      }),
    ).toThrow(/cms_verify_failed/);
  });

  it('rejects a tampered CMS signature', () => {
    const signed = fixture.sign(XML);
    signed[signed.length - 2] ^= 0xff;
    expect(() =>
      verifyDeviceCms(signed, {
        trustBundlePem: fixture.caPem,
        allowLegacyIphoneDeviceCa: false,
        nodeEnv: 'test',
      }),
    ).toThrow(/cms_verify_failed/);
  });

  it('fails closed in production when the trust bundle is missing', () => {
    expect(() =>
      assertEnrollmentTrustConfigured({ trustBundlePem: '', nodeEnv: 'production' }),
    ).toThrow(/cms_trust_missing/);
    expect(() =>
      verifyDeviceCms(fixture.sign(XML), {
        trustBundlePem: '   ',
        allowLegacyIphoneDeviceCa: true,
        nodeEnv: 'production',
      }),
    ).toThrow(/cms_trust_missing/);
  });

  it('rejects an expired CA unless the legacy flag selects that anchor', () => {
    const expired = fixture.expiredAuthority();
    const signed = expired.sign(XML);
    expect(() =>
      verifyDeviceCms(signed, {
        trustBundlePem: expired.caPem,
        allowLegacyIphoneDeviceCa: false,
        nodeEnv: 'test',
      }),
    ).toThrow(/cms_verify_failed/);
    expect(() =>
      verifyDeviceCms(signed, {
        trustBundlePem: fixture.caPem,
        allowLegacyIphoneDeviceCa: false,
        nodeEnv: 'production',
        legacyCaPem: expired.caPem,
      }),
    ).toThrow(/cms_verify_failed/);
    const accepted = verifyDeviceCms(signed, {
      trustBundlePem: fixture.caPem,
      allowLegacyIphoneDeviceCa: true,
      nodeEnv: 'test',
      legacyCaPem: expired.caPem,
    });
    expect(accepted.signer.issuer).toContain('Expired Device CA');
    expect(APPLE_IPHONE_DEVICE_CA_PEM).toContain('BEGIN CERTIFICATE');
  });

  it('reports signer metadata for an untrusted CMS without returning the payload', () => {
    const diagnostic = inspectUntrustedCms(fixture.sign(XML));
    const encoded = JSON.stringify(diagnostic);
    expect(diagnostic.signatureIntact).toBe(true);
    expect(diagnostic.signer.subject).toContain('Test iPhone');
    expect(diagnostic.signer.issuer).toContain('Test Device CA');
    expect(diagnostic.chain.length).toBeGreaterThan(0);
    expect(encoded).not.toContain('00008020-001A2B3C4D5E6F78');
    expect(encoded).not.toContain('CHALLENGE');
    expect(encoded).not.toContain('<plist');
    const tampered = fixture.sign(XML);
    tampered[tampered.length - 2] ^= 0xff;
    expect(() => inspectUntrustedCms(tampered)).toThrow(/cms_verify_failed/);
  });
});
