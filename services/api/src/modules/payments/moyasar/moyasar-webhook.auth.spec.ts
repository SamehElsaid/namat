import { NAMAT_PRICE_MINOR } from '@namat/shared';
import { MoyasarCheckoutService } from './moyasar-checkout.service';
import { MoyasarPaymentView } from './moyasar-facts';

const WEBHOOK_SECRET = 'webhook-secret-value';
const SECRET_KEY = 'sk_live_example_secret_key';

const paidBody = (patch: Record<string, unknown> = {}) => ({
  id: 'pay_1',
  status: 'paid',
  amount: NAMAT_PRICE_MINOR,
  currency: 'SAR',
  invoice_id: 'inv_1',
  refunded: 0,
  metadata: { namat_purchase_id: 'purchase_1' },
  source: { type: 'creditcard', company: 'mada', number: '411111******4242' },
  ...patch,
});

const paidView = (patch: Partial<MoyasarPaymentView> = {}): MoyasarPaymentView => ({
  id: 'pay_1',
  status: 'paid',
  amount: NAMAT_PRICE_MINOR,
  currency: 'SAR',
  invoiceId: 'inv_1',
  metadataPurchaseId: 'purchase_1',
  refunded: 0,
  sourceType: 'creditcard',
  brand: 'mada',
  last4: '4242',
  live: true,
  ...patch,
});

function webhookService(overrides: Record<string, unknown> = {}) {
  const applyMoyasarVerification = jest.fn(async () => ({ entitlementId: 'ent_1', status: 'approved' }));
  const fetchPayment = jest.fn(async () => ({ ok: true, value: paidView() }));
  const markProcessedRows: string[] = [];
  const webhookStore = new Map<string, { processed: boolean }>();
  const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
  Object.assign(service, {
    settings: {
      resolve: async () => ({
        webhookSecret: WEBHOOK_SECRET,
        secretKey: SECRET_KEY,
        mode: 'live',
      }),
    },
    webhooks: {
      findOne: async ({ where }: { where: { providerEventKey: string } }) => {
        const row = webhookStore.get(where.providerEventKey);
        return row ? { providerEventKey: where.providerEventKey, processed: row.processed } : null;
      },
      save: async (row: { providerEventKey: string; processed?: boolean }) => {
        webhookStore.set(row.providerEventKey, { processed: Boolean(row.processed) });
        return row;
      },
      create: (row: unknown) => row,
    },
    purchases: {
      findOne: async () => ({
        id: 'purchase_1',
        moyasarInvoiceId: 'inv_1',
        status: 'pending',
        amountMinor: NAMAT_PRICE_MINOR,
        currency: 'SAR',
      }),
    },
    client: { fetchPayment },
    purchasesService: { applyMoyasarVerification },
    markProcessed: async (eventId: string) => {
      markProcessedRows.push(eventId);
      const key = `moyasar:${eventId}`;
      const existing = webhookStore.get(key);
      if (existing) existing.processed = true;
    },
    ...overrides,
  });
  return { service, applyMoyasarVerification, fetchPayment, webhookStore, markProcessedRows };
}

describe('Moyasar webhook authentication (fail-closed)', () => {
  it('rejects a missing secret_token before any payment work', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_missing',
      type: 'payment_paid',
      data: paidBody(),
    });
    expect(result).toEqual({ ok: false, authenticated: false });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret_token before any payment work', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_wrong',
      type: 'payment_paid',
      secret_token: 'forged-token-value',
      live: true,
      data: paidBody(),
    });
    expect(result).toEqual({ ok: false, authenticated: false });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('does not apply a known payment when the webhook secret is wrong', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService({
      purchases: {
        findOne: async () => ({
          id: 'purchase_1',
          moyasarInvoiceId: 'inv_1',
          status: 'pending',
          amountMinor: NAMAT_PRICE_MINOR,
          currency: 'SAR',
        }),
      },
    });
    const result = await service.handleWebhook({
      id: 'evt_known_wrong',
      type: 'payment_paid',
      secret_token: 'wrong-secret-token',
      live: true,
      data: paidBody(),
    });
    expect(result).toEqual({ ok: false, authenticated: false });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('does not apply a known payment when the webhook secret is missing', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_known_missing',
      type: 'payment_paid',
      live: true,
      data: paidBody(),
    });
    expect(result).toEqual({ ok: false, authenticated: false });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('accepts a valid payment_paid webhook after secret verification', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_paid',
      type: 'payment_paid',
      secret_token: WEBHOOK_SECRET,
      live: true,
      data: paidBody(),
    });
    expect(result).toMatchObject({ ok: true, authenticated: true, idempotent: false });
    expect(fetchPayment).toHaveBeenCalledWith(SECRET_KEY, 'pay_1');
    expect(applyMoyasarVerification).toHaveBeenCalledTimes(1);
  });

  it('is idempotent on webhook replay', async () => {
    const { service, applyMoyasarVerification, fetchPayment, webhookStore } = webhookService();
    webhookStore.set('moyasar:evt_replay', { processed: true });
    const result = await service.handleWebhook({
      id: 'evt_replay',
      type: 'payment_paid',
      secret_token: WEBHOOK_SECRET,
      live: true,
      data: paidBody(),
    });
    expect(result).toMatchObject({ ok: true, idempotent: true, authenticated: true });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('ignores unknown non-payment events after authentication', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_card',
      type: 'card_auth_failed',
      secret_token: WEBHOOK_SECRET,
      live: true,
      data: { id: 'ca_1' },
    });
    expect(result).toMatchObject({ ok: true, ignored: true });
    expect(fetchPayment).not.toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });

  it('applies a valid payment_refunded webhook after authentication', async () => {
    const refunded = paidView({ status: 'refunded', refunded: NAMAT_PRICE_MINOR });
    const applyMoyasarVerification = jest.fn(async () => ({ entitlementId: null, status: 'refunded' }));
    const fetchPayment = jest.fn(async () => ({ ok: true, value: refunded }));
    const { service } = webhookService({
      client: { fetchPayment },
      purchasesService: { applyMoyasarVerification },
    });
    const result = await service.handleWebhook({
      id: 'evt_refund',
      type: 'payment_refunded',
      secret_token: WEBHOOK_SECRET,
      live: true,
      data: paidBody({ status: 'refunded', refunded: NAMAT_PRICE_MINOR }),
    });
    expect(result).toMatchObject({ ok: true, authenticated: true });
    expect(applyMoyasarVerification).toHaveBeenCalledTimes(1);
  });

  it('does not apply a live-key workflow for a webhook marked live:false', async () => {
    const { service, applyMoyasarVerification, fetchPayment } = webhookService();
    const result = await service.handleWebhook({
      id: 'evt_test_on_live',
      type: 'payment_paid',
      secret_token: WEBHOOK_SECRET,
      live: false,
      data: paidBody(),
    });
    expect(result).toMatchObject({ ok: true, authenticated: true, pending: true });
    expect(fetchPayment).toHaveBeenCalled();
    expect(applyMoyasarVerification).not.toHaveBeenCalled();
  });
});

describe('Moyasar invoice callback is not payment proof', () => {
  it('fetches the invoice before changing purchase state', async () => {
    const applyInvoice = jest.fn();
    const fetchInvoice = jest.fn(async () => ({
      ok: true,
      value: {
        id: 'inv_1',
        status: 'paid',
        url: 'https://checkout.moyasar.test/inv',
        amount: NAMAT_PRICE_MINOR,
        currency: 'SAR',
        metadataPurchaseId: 'purchase_1',
        payments: [paidView()],
      },
    }));
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      purchases: {
        findOne: async () => ({ id: 'purchase_1', moyasarInvoiceId: 'inv_1', status: 'pending' }),
      },
      settings: { resolve: async () => ({ secretKey: SECRET_KEY }) },
      client: { fetchInvoice },
      applyInvoice,
    });
    // Bind private method through prototype call path used by handleInvoiceCallback
    const result = await service.handleInvoiceCallback({
      id: 'inv_1',
      status: 'paid',
      amount: 1,
      currency: 'USD',
    });
    expect(result).toEqual({ ok: true });
    expect(fetchInvoice).toHaveBeenCalledWith(SECRET_KEY, 'inv_1');
    expect(applyInvoice).toHaveBeenCalledTimes(1);
  });

  it('does not grant from callback body alone when secret key is absent', async () => {
    const applyInvoice = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      purchases: {
        findOne: async () => ({ id: 'purchase_1', moyasarInvoiceId: 'inv_1', status: 'pending' }),
      },
      settings: { resolve: async () => ({ secretKey: '' }) },
      client: { fetchInvoice: jest.fn() },
      applyInvoice,
    });
    const result = await service.handleInvoiceCallback({
      id: 'inv_1',
      status: 'paid',
      amount: NAMAT_PRICE_MINOR,
      currency: 'SAR',
    });
    expect(result).toEqual({ ok: true, pending: true });
    expect(applyInvoice).not.toHaveBeenCalled();
  });
});
