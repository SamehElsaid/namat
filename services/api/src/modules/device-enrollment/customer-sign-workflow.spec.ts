import { execFileSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(__dirname, '../../../../..');

function source(path: string): string {
  return readFileSync(join(root, path), 'utf8');
}

describe('customer signing workflow', () => {
  const workflow = source('.github/workflows/ios-customer-sign.yml');
  const resign = source('apps/ios/scripts/resign-customer-ipa.sh');
  const rebuild = source('apps/ios/scripts/build-customer-release.sh');
  const fetchPayload = source('apps/ios/scripts/fetch-stable-payload.sh');

  it('contains the real sign, rebuild, upload, and completion commands in order', () => {
    expect(workflow).not.toContain('IPA export is not available on this runner yet');
    expect(workflow.indexOf('fetch-stable-payload.sh')).toBeGreaterThan(0);
    expect(workflow.indexOf('build-customer-release.sh')).toBeGreaterThan(0);
    const resignAt = workflow.indexOf('resign-customer-ipa.sh');
    const uploadAt = workflow.indexOf('/artifact');
    const completeAt = workflow.indexOf('/complete');
    expect(resignAt).toBeGreaterThan(0);
    expect(uploadAt).toBeGreaterThan(resignAt);
    expect(completeAt).toBeGreaterThan(uploadAt);
    expect(workflow).not.toContain('artifactRelativePath');

    const resignCommands = [
      'security create-keychain',
      'security import',
      'security cms -D',
      'embedded.mobileprovision',
      'codesign --force --sign',
      'codesign --verify --deep --strict',
      'zip -qr',
    ];
    let cursor = -1;
    for (const command of resignCommands) {
      const at = resign.indexOf(command);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
    expect(resign).toContain('sa.shara.namat.app');
    expect(resign).toContain('Apple Distribution');
    expect(rebuild).toContain('build-airlift-xcframework.sh');
    expect(rebuild).toContain('xcodebuild');
    expect(rebuild).toContain('package-unsigned-release.sh');
    expect(fetchPayload).toContain('stable-payload');
    expect(fetchPayload).toContain('checksum mismatch');
  });

  it('packages an IPA when the signing tools succeed', () => {
    const output = execFileSync(
      'bash',
      ['apps/ios/scripts/test-resign-with-stubs.sh'],
      { cwd: root, encoding: 'utf8' },
    );
    expect(output).toContain('resign mechanics produced NAMAT.ipa');
  });
});
