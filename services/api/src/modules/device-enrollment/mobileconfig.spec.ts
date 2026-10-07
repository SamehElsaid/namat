import { buildEnrollmentProfile } from './mobileconfig';
import { parseVerifiedDevicePlist } from './plist';
import { chooseSigningMode } from './install-strategy';

describe('mobileconfig and enrollment parsing', () => {
  it('requests only the required attributes and a one-time challenge', () => {
    const xml = buildEnrollmentProfile({
      callbackUrl: 'https://namat.test/api/v1/device-enrollment/callback/token',
      nodeEnv: 'production',
      challenge: 'challenge-value',
    });
    expect(xml).toContain('<string>Profile Service</string>');
    expect(xml).toContain('<string>UDID</string>');
    expect(xml).toContain('<string>PRODUCT</string>');
    expect(xml).toContain('<string>VERSION</string>');
    expect(xml).toContain('<key>Challenge</key>');
    expect(xml).toContain('<string>challenge-value</string>');
    expect(xml).not.toMatch(/IMEI|ICCID|PHONE_NUMBER|AppleID/i);
    expect(xml).toContain('https://namat.test/api/v1/device-enrollment/callback/token');
    expect(xml).toContain('Card numbers and Wallet data are not collected');
  });

  it('refuses a non-https callback in production', () => {
    expect(() =>
      buildEnrollmentProfile({
        callbackUrl: 'http://namat.test/callback',
        nodeEnv: 'production',
        challenge: 'challenge-value',
      }),
    ).toThrow(/https/);
  });

  it('parses a verified plist and ignores IMEI', () => {
    const xml = `<?xml version="1.0"?><plist><dict>
        <key>UDID</key><string>00008020-001A2B3C4D5E6F78</string>
        <key>PRODUCT</key><string>iPhone16,1</string>
        <key>VERSION</key><string>18.0</string>
        <key>CHALLENGE</key><string>expected-challenge</string>
        <key>IMEI</key><string>123</string>
      </dict></plist>`;
    expect(parseVerifiedDevicePlist(xml)).toEqual({
      udid: '00008020-001A2B3C4D5E6F78',
      product: 'iPhone16,1',
      version: '18.0',
      challenge: 'expected-challenge',
    });
  });

  it('rejects a raw plist that was not the verified CMS payload', () => {
    const wrapped = `signed-prefix<?xml version="1.0"?><plist><dict>
      <key>UDID</key><string>00008020-001A2B3C4D5E6F78</string>
      <key>CHALLENGE</key><string>expected-challenge</string>
    </dict></plist>`;
    expect(() => parseVerifiedDevicePlist(wrapped)).toThrow(/plist/);
  });

  it('rebuilds only when the verified Release identity changes', () => {
    const stable = {
      sourceCommit: 'abc',
      airliftSha: 'ffi',
      appVersion: '1.2.0',
    };
    expect(chooseSigningMode(stable, stable)).toBe('RESIGN');
    expect(
      chooseSigningMode(stable, { ...stable, sourceCommit: 'def' }),
    ).toBe('FULL_REBUILD');
    expect(chooseSigningMode(null, stable)).toBe('FULL_REBUILD');
  });
});
