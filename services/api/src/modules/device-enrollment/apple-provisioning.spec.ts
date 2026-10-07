import { createVerify, generateKeyPairSync } from 'crypto';
import {
  AppStoreConnectProvisioningProvider,
  appleJwt,
} from './apple-provisioning';
import { GitHubActionsSigningDispatcher } from './signing-dispatcher';

describe('Apple provisioning and signing dispatch', () => {
  it('signs an App Store Connect JWT with ES256', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', {
      namedCurve: 'prime256v1',
    });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const token = appleJwt('KEYID', 'ISSUER', pem, 1_700_000_000);
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    const header = JSON.parse(Buffer.from(headerPart, 'base64url').toString());
    const payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString());
    expect(header).toMatchObject({ alg: 'ES256', kid: 'KEYID', typ: 'JWT' });
    expect(payload).toMatchObject({
      iss: 'ISSUER',
      aud: 'appstoreconnect-v1',
    });
    const verified = createVerify('SHA256')
      .update(`${headerPart}.${payloadPart}`)
      .verify(
        { key: publicKey, dsaEncoding: 'ieee-p1363' },
        Buffer.from(signaturePart, 'base64url'),
      );
    expect(verified).toBe(true);
  });

  it('registers a device and counts iPhone capacity without logging the identifier', async () => {
    const udid = '00008030-0011223344556677';
    const logs: string[] = [];
    const spy = jest.spyOn(console, 'log').mockImplementation((...args) => {
      logs.push(args.map(String).join(' '));
    });
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('/v1/devices?filter[platform]')) {
        return json({
          data: [
            { id: 'iphone-1', attributes: { deviceClass: 'IPHONE' } },
            { id: 'ipad-1', attributes: { deviceClass: 'IPAD' } },
          ],
        });
      }
      if (init?.method === 'POST' && href.endsWith('/v1/devices')) {
        return json({ data: { id: 'iphone-new' } });
      }
      if (init?.method === 'POST' && href.endsWith('/v1/profiles')) {
        return json({
          data: {
            id: 'profile-1',
            attributes: { profileContent: Buffer.from('abc').toString('base64') },
          },
        });
      }
      return json({ data: [] });
    });
    const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const provider = new AppStoreConnectProvisioningProvider(
      {
        issuerId: 'issuer',
        keyId: 'key',
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
        bundleId: 'sa.shara.namat.app',
        bundleResourceId: 'bundle-resource',
        certificateId: 'cert-1',
        deviceLimit: 100,
      },
      fetchImpl as unknown as typeof fetch,
    );
    const registered = await provider.registerDevice({ udid, name: 'NAMAT' });
    expect(registered.appleDeviceId).toBe('iphone-new');
    const capacity = await provider.capacity();
    expect(capacity).toMatchObject({ registeredIphoneCount: 1, remaining: 99 });
    const profile = await provider.regenerateProfile(['iphone-1', 'iphone-new']);
    expect(profile.profileId).toBe('profile-1');
    const posted = fetchImpl.mock.calls.map((call) => String(call[1]?.body ?? '')).join('\n');
    expect(posted).toContain(udid);
    expect(logs.join('\n')).not.toContain(udid);
    spy.mockRestore();
  });

  it('dispatches a signing workflow without a device identifier', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true }) as Response);
    const dispatcher = new GitHubActionsSigningDispatcher({
      token: 'gh-token',
      repository: 'sharahsa0-creator/namat',
      workflow: 'ios-customer-sign.yml',
      ref: 'main',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const result = await dispatcher.dispatch({
      id: 'job-1',
      mode: 'RESIGN',
      enrollmentId: 'enr-1',
    });
    expect(result.accepted).toBe(true);
    const body = String(fetchImpl.mock.calls[0][1]?.body);
    expect(body).toContain('"mode":"RESIGN"');
    expect(body).not.toMatch(/udid/i);
    expect(String(fetchImpl.mock.calls[0][0])).toContain(
      '/actions/workflows/ios-customer-sign.yml/dispatches',
    );
  });
});

function json(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}
