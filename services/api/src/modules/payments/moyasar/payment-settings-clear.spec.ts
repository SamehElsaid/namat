import { ConfigService } from '@nestjs/config';
import { PaymentSettingsService } from './payment-settings.service';
import { encryptSecret, paymentConfigKey } from './secret-box';

const CONFIG_KEY = 'payment-config-key-material-32b-x9';

function buildService(envOverrides: Record<string, string> = {}) {
  const key = paymentConfigKey(CONFIG_KEY)!;
  const credRow: any = {
    id: 'default',
    secretKeyCipher: encryptSecret('sk_test_stored_secret', key),
    publishableKeyCipher: encryptSecret('pk_test_stored_pub', key),
    webhookSecretCipher: encryptSecret('stored-webhook-secret-value', key),
  };
  const credentials = {
    row: credRow,
    findOne: jest.fn(async () => credentials.row),
    save: jest.fn(async (r: any) => { credentials.row = r; return r; }),
    create: jest.fn((r: any) => r),
  };
  const settingsRow: any = { id: 'default', checkoutEnabled: false, mode: 'test' };
  const settings = {
    findOne: jest.fn(async () => settingsRow),
    save: jest.fn(async (r: any) => r),
    create: jest.fn((r: any) => r),
  };
  const env: Record<string, string> = {
    'app.paymentConfigKey': CONFIG_KEY,
    'app.moyasarSecretKey': '',
    'app.moyasarPublishableKey': '',
    'app.moyasarWebhookSecret': '',
    'app.publicBaseUrl': 'https://namat.shara.sa',
    ...envOverrides,
  };
  const config = { get: (k: string) => env[k] } as unknown as ConfigService;
  const audit = { record: jest.fn(async () => ({})) };
  const service = Object.create(PaymentSettingsService.prototype) as PaymentSettingsService;
  Object.assign(service, { settings, credentials, config, audit });
  return { service, credentials, audit };
}

describe('payment settings credential clearing', () => {
  it('clears the stored secret key and reverts it to the (empty) environment value', async () => {
    const { service, credentials, audit } = buildService();
    const result = await service.update(
      { clearSecretKey: true },
      { userId: 'owner-1', email: 'owner@example.com' },
    );
    expect(result.ok).toBe(true);
    expect(credentials.row.secretKeyCipher).toBeNull();
    // other credentials are untouched
    expect(credentials.row.publishableKeyCipher).not.toBeNull();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'payment_settings.clear_credentials' }),
    );
    const view = await service.view();
    expect(view.secretKey).toBeNull();
  });

  it('does not clear credentials that were not requested', async () => {
    const { service, credentials } = buildService();
    await service.update(
      { clearWebhookSecret: true },
      { userId: 'owner-1', email: 'owner@example.com' },
    );
    expect(credentials.row.webhookSecretCipher).toBeNull();
    expect(credentials.row.secretKeyCipher).not.toBeNull();
    expect(credentials.row.publishableKeyCipher).not.toBeNull();
  });

  it('allows clearing the optional publishable key while checkout stays enabled', async () => {
    const { service, credentials } = buildService();
    const result = await service.update(
      { checkoutEnabled: true, clearPublishableKey: true },
      { userId: 'owner-1', email: 'owner@example.com' },
    );
    expect(result.ok).toBe(true);
    expect(credentials.row.publishableKeyCipher).toBeNull();
    const view = await service.view();
    expect(view.ready).toBe(true);
    expect(view.publishableKey).toBeNull();
  });
});
