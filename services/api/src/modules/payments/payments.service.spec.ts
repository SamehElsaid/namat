import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { NearPayProvider } from './nearpay/nearpay.provider';
import { PurchasesService } from '../purchases/purchases.service';
import { PaymentWebhookEventEntity } from '../../database/entities';

describe('NearPay webhook idempotency', () => {
  let service: PaymentsService;
  let webhookRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let purchases: { applyPaymentEvent: jest.Mock };
  let nearpay: {
    isMockMode: jest.Mock;
    verifyWebhookSignature: jest.Mock;
    normalizeWebhook: jest.Mock;
  };

  beforeEach(async () => {
    webhookRepo = {
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'w1', ...x })),
    };
    purchases = {
      applyPaymentEvent: jest.fn(async () => ({
        purchaseId: 'p1',
        entitlementId: 'e1',
      })),
    };
    nearpay = {
      isMockMode: jest.fn(() => true),
      verifyWebhookSignature: jest.fn(() => true),
      normalizeWebhook: jest.fn(async () => ({
        providerEventKey: 'approved:tx-1:namat_ref:approved',
        eventType: 'approved',
        transactionId: 'tx-1',
        customerReferenceNumber: 'namat_ref',
        status: 'approved',
        amountMinor: 29900,
        currency: 'SAR',
        merchantId: 'm1',
        terminalId: 't1',
        retrievalReferenceNumber: null,
      })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: NearPayProvider, useValue: nearpay },
        { provide: PurchasesService, useValue: purchases },
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: getRepositoryToken(PaymentWebhookEventEntity),
          useValue: webhookRepo,
        },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('creates entitlement on first approved webhook', async () => {
    webhookRepo.findOne.mockResolvedValue(null);
    const result = await service.handleNearPayWebhook(
      { payload: { is_approved: true } },
      {},
    );
    expect(result.idempotent).toBe(false);
    expect(result.entitlementId).toBe('e1');
    expect(purchases.applyPaymentEvent).toHaveBeenCalledTimes(1);
  });

  it('ignores duplicate webhook with same providerEventKey', async () => {
    webhookRepo.findOne.mockResolvedValue({
      id: 'w1',
      providerEventKey: 'approved:tx-1:namat_ref:approved',
      processed: true,
    });
    const result = await service.handleNearPayWebhook(
      { payload: { is_approved: true } },
      {},
    );
    expect(result.idempotent).toBe(true);
    expect(purchases.applyPaymentEvent).not.toHaveBeenCalled();
  });

  it('never persists pan from webhook payload', async () => {
    const payload = {
      payload: {
        id: 'tx-1',
        is_approved: true,
        pan: '1234 56** **** 1234',
        customer_reference_number: 'namat_ref',
        amount_authorized: { value: '299.00' },
      },
    };
    // Real normalizer strips pan
    const realNearPay = new NearPayProvider({
      get: (k: string) => {
        if (k === 'app.nearpayApiKey') return '';
        if (k === 'app.nearpayBaseUrl') return 'https://sandbox-api.nearpay.io';
        if (k === 'app.nearpayWebhookSecret') return '';
        return undefined;
      },
    } as unknown as ConfigService);

    const normalized = await realNearPay.normalizeWebhook(payload, {});
    expect(JSON.stringify(normalized)).not.toMatch(/pan/i);
    expect(JSON.stringify(normalized)).not.toContain('1234');
    expect(normalized.customerReferenceNumber).toBe('namat_ref');
    expect(normalized.status).toBe('approved');
  });
});

describe('NearPay live state changes require an authoritative transaction', () => {
  let service: PaymentsService;
  let purchases: {
    applyPaymentEvent: jest.Mock;
    findByCustomerRef: jest.Mock;
    rememberNearpayJob: jest.Mock;
  };
  let nearpay: {
    isMockMode: jest.Mock;
    verifyWebhookSignature: jest.Mock;
    normalizeWebhook: jest.Mock;
    fetchAuthoritativeTransaction: jest.Mock;
  };

  function event(status: 'approved' | 'reversed' | 'refunded', extra: Record<string, unknown> = {}) {
    return {
      providerEventKey: `${status}:key`,
      eventType: status === 'refunded' ? 'approved' : status,
      transactionId: extra.transactionId === undefined ? 'tx-real' : extra.transactionId,
      customerReferenceNumber: extra.customerReferenceNumber ?? 'webhook-ref',
      status,
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      terminalId: 't1',
      retrievalReferenceNumber: null,
    };
  }

  beforeEach(async () => {
    purchases = {
      applyPaymentEvent: jest.fn(async () => ({
        purchaseId: 'p1',
        entitlementId: 'e1',
      })),
      findByCustomerRef: jest.fn(async (ref: string) => ({
        customerReferenceNumber: ref,
        nearpayJobId: 'job-a',
      })),
      rememberNearpayJob: jest.fn(),
    };
    nearpay = {
      isMockMode: jest.fn(() => false),
      verifyWebhookSignature: jest.fn(() => true),
      normalizeWebhook: jest.fn(),
      fetchAuthoritativeTransaction: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: NearPayProvider, useValue: nearpay },
        { provide: PurchasesService, useValue: purchases },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === 'app.nearpayMerchantId') return 'm1';
              if (key === 'app.nearpayTerminalId') return 't1';
              return undefined;
            },
          },
        },
        {
          provide: getRepositoryToken(PaymentWebhookEventEntity),
          useValue: {
            findOne: jest.fn(async () => null),
            create: jest.fn((x) => x),
            save: jest.fn(async (x) => x),
          },
        },
      ],
    }).compile();
    service = module.get(PaymentsService);
  });

  async function deliver(status: 'approved' | 'reversed' | 'refunded', extra: Record<string, unknown> = {}) {
    nearpay.normalizeWebhook.mockResolvedValue(event(status, extra));
    return service.handleNearPayWebhook({}, {});
  }

  it('rejects forged approved, reversed, and refunded events with no transaction id', async () => {
    for (const status of ['approved', 'reversed', 'refunded'] as const) {
      await expect(
        deliver(status, { transactionId: null, customerReferenceNumber: 'namat_ref' }),
      ).rejects.toThrow(/transaction id/i);
    }
    expect(purchases.applyPaymentEvent).not.toHaveBeenCalled();
    expect(nearpay.fetchAuthoritativeTransaction).not.toHaveBeenCalled();
  });

  it('rejects a webhook whose reference is not on the authoritative transaction', async () => {
    nearpay.fetchAuthoritativeTransaction.mockResolvedValue(null);
    await expect(deliver('approved', { customerReferenceNumber: 'forged-ref' })).rejects.toThrow(
      /could not be confirmed/i,
    );
    expect(purchases.applyPaymentEvent).not.toHaveBeenCalled();
  });

  it('binds a valid transaction to its NAMAT purchase, not the webhook reference', async () => {
    nearpay.fetchAuthoritativeTransaction.mockResolvedValue({
      approved: true,
      reversed: false,
      refunded: false,
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      terminalId: 't1',
      customerReferenceNumber: 'purchase-a',
      transactionId: 'tx-real',
      jobId: 'job-a',
    });
    const result = await deliver('approved', {
      customerReferenceNumber: 'purchase-b',
    });
    expect(result.status).toBe('approved');
    expect(purchases.applyPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        customerReferenceNumber: 'purchase-a',
        transactionId: 'tx-real',
        status: 'approved',
      }),
    );
  });

  it('returns the authoritative reversed status instead of a forged approved webhook', async () => {
    nearpay.fetchAuthoritativeTransaction.mockResolvedValue({
      approved: false,
      reversed: true,
      refunded: false,
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      terminalId: 't1',
      customerReferenceNumber: 'purchase-a',
      transactionId: 'tx-real',
      jobId: null,
    });
    const result = await deliver('approved');
    expect(result.status).toBe('reversed');
    expect(purchases.applyPaymentEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'reversed', customerReferenceNumber: 'purchase-a' }),
    );
  });

  it('rejects an authoritative transaction whose job belongs to another purchase', async () => {
    nearpay.fetchAuthoritativeTransaction.mockResolvedValue({
      approved: false,
      reversed: false,
      refunded: true,
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      terminalId: 't1',
      customerReferenceNumber: 'purchase-a',
      transactionId: 'tx-other',
      jobId: 'job-from-other-purchase',
    });
    await expect(deliver('refunded')).rejects.toThrow(/job/i);
    expect(purchases.applyPaymentEvent).not.toHaveBeenCalled();
  });
});
