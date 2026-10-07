import { collectForbiddenKeys, stripForbiddenKeys } from './privacy.guard';
import { FORBIDDEN_PAYLOAD_FIELDS } from '@namat/shared';

describe('PrivacyGuard field detection', () => {
  it('rejects walletLocalKey / pan / cvv nested payloads', () => {
    const hits = collectForbiddenKeys({
      prompt: 'make a blue card',
      stylePresetId: 'ocean',
      nested: {
        walletLocalKey: 'should-never-arrive',
        payment: { pan: '4111', cvv: '123' },
      },
    });
    expect(hits).toEqual(
      expect.arrayContaining([
        'nested.walletLocalKey',
        'nested.payment.pan',
        'nested.payment.cvv',
      ]),
    );
  });

  it('allows safe AI generation payloads', () => {
    const hits = collectForbiddenKeys({
      prompt: 'geometric sand dunes',
      stylePresetId: 'desert',
      referenceImageUrl: 'https://cdn.example/ref.png',
    });
    expect(hits).toHaveLength(0);
  });

  it('strips card secrets from a provider webhook body without keeping them', () => {
    const body = {
      transaction: {
        pan: '4111111111111111',
        is_approved: true,
        customer_reference_number: 'namat_ref',
      },
      cvv: '123',
    };
    const removed = stripForbiddenKeys(body);
    expect(removed).toEqual(expect.arrayContaining(['pan', 'cvv']));
    expect(JSON.stringify(body)).not.toContain('4111');
    expect(JSON.stringify(body)).not.toContain('123');
    expect(
      (body.transaction as { customer_reference_number: string })
        .customer_reference_number,
    ).toBe('namat_ref');
  });

  it('covers shared forbidden list', () => {
    expect(FORBIDDEN_PAYLOAD_FIELDS).toEqual(
      expect.arrayContaining(['pan', 'cvv', 'walletLocalKey', 'pin']),
    );
  });
});
