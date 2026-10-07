import { ConfigService } from '@nestjs/config';
import { NearPayProvider } from './nearpay.provider';

function provider(values: Record<string, string>) {
  const config = {
    get: (key: string) => values[key] ?? '',
  } as ConfigService;
  return new NearPayProvider(config);
}

describe('NearPay webhook secret', () => {
  it('rejects unsigned webhooks in production when the secret is empty', () => {
    const nearpay = provider({ 'app.nodeEnv': 'production' });
    expect(nearpay.verifyWebhookSignature('{}', {})).toBe(false);
  });

  it('allows unsigned webhooks only outside production', () => {
    const nearpay = provider({ 'app.nodeEnv': 'development' });
    expect(nearpay.verifyWebhookSignature('{}', {})).toBe(true);
  });

  it('requires the configured shared secret', () => {
    const nearpay = provider({
      'app.nodeEnv': 'production',
      'app.nearpayWebhookSecret': 'secret-value',
    });
    expect(
      nearpay.verifyWebhookSignature('{}', {
        authorization: 'Bearer secret-value',
      }),
    ).toBe(true);
    expect(
      nearpay.verifyWebhookSignature('{}', {
        authorization: 'Bearer other',
      }),
    ).toBe(false);
  });
});
