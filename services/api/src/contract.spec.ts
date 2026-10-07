import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('iOS / API contract', () => {
  const client = read('apps/ios/Sources/NamatCore/NamatAPIClient.swift');
  const models = read('apps/ios/Sources/NamatCore/Models.swift');
  const boot = read('apps/ios/Sources/NamatApp/NamatAppMain.swift');
  const factory = read('apps/ios/Sources/NamatCore/WalletEngineFactory.swift');

  it('uses the production API base and aligned routes', () => {
    const config = read('apps/ios/Sources/NamatCore/AppEnvironment.swift');
    expect(config).toContain('https://namat.shara.sa/api/v1');
    expect(config).not.toContain('https://api.namat.shara.sa');
    expect(client).toContain('auth/otp/verify');
    expect(client).toContain('skins/manifest');
    expect(client).toContain('remote-config');
    expect(client).toContain('installationId');
    expect(client).not.toContain('deviceInstallationId');
    expect(client).not.toContain('config/app');
    expect(models).toContain('activeDevices');
    expect(models).toContain('stylePresetId');
    expect(models).toContain('resultUrl');
    expect(models).not.toContain('entitlementActive');
    expect(models).not.toContain('licenseLabel');
  });

  it('does not boot LocalStubEngine from the app entry point', () => {
    expect(boot).toContain('WalletEngineFactory.makeForCurrentBuild()');
    expect(boot).not.toContain('LocalStubEngine()');
    expect(factory).toContain('RealAirliftFFIClient()');
    expect(factory).toContain('#if DEBUG');
  });
});
