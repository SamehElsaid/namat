import { createHash } from 'crypto';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { QueryFailedError } from 'typeorm';
import { NAMAT_PRICE_MINOR } from '@namat/shared';
import { IS_ADMIN_KEY, IS_OWNER_KEY } from '../../../common/decorators/auth.decorators';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { AuditLogEntity } from '../../../database/entities/audit-log.entity';
import { EntitlementEntity } from '../../../database/entities/entitlement.entity';
import { PurchaseEntity } from '../../../database/entities/purchase.entity';
import { UserEntity } from '../../../database/entities/user.entity';
import { AuditService } from '../../audit/audit.service';
import { PurchasesService } from '../../purchases/purchases.service';
import { CheckoutController } from '../../purchases/checkout.controller';
import { CompatibilityService } from '../../compatibility/compatibility.service';
import { AppVersionEntity } from '../../../database/entities/compatibility.entity';
import { verifyIpaSignature } from '../../compatibility/ipa-signature';
import {
  checkoutReadiness,
  fullRefundConfirmed,
  maskKey,
  moyasarPaymentGrantsEntitlement,
  MoyasarPaymentView,
  redactPaymentPayload,
} from './moyasar-facts';
import { encryptSecret, paymentConfigKey, secretsEqual } from './secret-box';
import { MoyasarCheckoutService } from './moyasar-checkout.service';
import { PaymentSettingsService } from './payment-settings.service';

const livePayment = (patch: Partial<MoyasarPaymentView> = {}): MoyasarPaymentView => ({
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

describe('Moyasar payment policy', () => {
  it('keeps checkout unavailable until configuration is ready', () => {
    expect(
      checkoutReadiness({
        mode: 'test',
        secretKey: '',
        publishableKey: '',
        webhookSecret: '',
        publicBaseUrl: 'http://127.0.0.1',
      }).ready,
    ).toBe(false);
    expect(
      checkoutReadiness({
        mode: 'test',
        secretKey: 'sk_test_example_key',
        publishableKey: '',
        webhookSecret: 'webhook-secret-value',
        publicBaseUrl: 'https://namat.shara.sa',
      }).ready,
    ).toBe(true);
    expect(
      checkoutReadiness({
        mode: 'test',
        secretKey: 'sk_test_example_key',
        publishableKey: 'pk_test_example_key',
        webhookSecret: 'webhook-secret-value',
        publicBaseUrl: 'https://namat.shara.sa',
      }).ready,
    ).toBe(true);
    expect(
      checkoutReadiness({
        mode: 'test',
        secretKey: 'sk_test_example_key',
        publishableKey: 'pk_live_wrong_mode_key',
        webhookSecret: 'webhook-secret-value',
        publicBaseUrl: 'https://namat.shara.sa',
      }).reasons,
    ).toContain('publishable_key');
  });

  it('treats an empty publishable key as ready for Hosted Invoice checkout', () => {
    const result = checkoutReadiness({
      mode: 'live',
      secretKey: 'sk_live_example_secret_key',
      publishableKey: '',
      webhookSecret: 'webhook-secret-value',
      publicBaseUrl: 'https://namat.shara.sa',
    });
    expect(result.ready).toBe(true);
    expect(result.reasons).not.toContain('publishable_key');
  });

  it('rejects amount, currency, association, and test-mode mismatches', () => {
    const purchaseId = 'purchase_1';
    const invoiceId = 'inv_1';
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment(), purchaseId, invoiceId }).ok).toBe(true);
    expect(moyasarPaymentGrantsEntitlement({ mode: 'test', payment: livePayment({ live: false }), purchaseId, invoiceId }).reasons).toContain('mode');
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment({ live: false }), purchaseId, invoiceId }).reasons).toContain('mode');
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment({ amount: 100 }), purchaseId, invoiceId }).reasons).toContain('amount');
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment({ currency: 'USD' }), purchaseId, invoiceId }).reasons).toContain('currency');
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment({ metadataPurchaseId: 'other' }), purchaseId, invoiceId }).reasons).toContain('purchase');
    expect(moyasarPaymentGrantsEntitlement({ mode: 'live', payment: livePayment({ invoiceId: 'other' }), purchaseId, invoiceId }).reasons).toContain('invoice');
  });

  it('confirms only a full refund of the purchase amount', () => {
    expect(fullRefundConfirmed(livePayment({ status: 'refunded', refunded: NAMAT_PRICE_MINOR }))).toBe(true);
    expect(fullRefundConfirmed(livePayment({ status: 'refunded', refunded: 1000 }))).toBe(false);
    expect(fullRefundConfirmed(livePayment({ status: 'paid', refunded: 0 }))).toBe(false);
  });

  it('redacts secrets and never returns a full key', () => {
    const redacted = JSON.stringify(redactPaymentPayload({
      secret_token: 'webhook-secret-value',
      source: { number: '4111111111114242', token: 'tok_live', cvc: '123', company: 'mada' },
    }));
    expect(redacted).not.toContain('webhook-secret-value');
    expect(redacted).not.toContain('411111');
    expect(redacted).not.toContain('tok_live');
    expect(maskKey('sk_test_example_key')).toBe('sk_test_…_key');
    expect(maskKey('sk_test_example_key')).not.toContain('example');
    expect(paymentConfigKey('payment-config-key')).toBeNull();
    expect(paymentConfigKey('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa')).toBeNull();
    const key = paymentConfigKey('payment-config-key-material-32b-x9');
    expect(key).not.toBeNull();
    const cipher = encryptSecret('sk_test_example_key', key!);
    expect(cipher).not.toContain('sk_test_example_key');
    expect(secretsEqual('same-secret-value', 'same-secret-value')).toBe(true);
    expect(secretsEqual('same-secret-value', 'other-secret-val')).toBe(false);
  });

  it('does not treat a forged webhook token as proof', async () => {
    const apply = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      settings: { resolve: async () => ({ webhookSecret: 'webhook-secret-value', secretKey: 'sk_test_example_key', mode: 'test' }) },
      webhooks: { findOne: async () => null, save: async (row: unknown) => row, create: (row: unknown) => row },
      purchases: { findOne: async () => null },
      client: { fetchPayment: apply },
      purchasesService: { applyMoyasarVerification: apply },
    });
    const result = await service.handleWebhook({
      id: 'evt_1',
      secret_token: 'forged',
      data: { id: 'pay_unknown', status: 'paid', amount: NAMAT_PRICE_MINOR, currency: 'SAR' },
    });
    expect(result).toMatchObject({ authenticated: false });
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('checkout authorization and duplicates', () => {
  it('uses the signed-in user and does not ask for another code', async () => {
    const start = jest.fn(async () => ({ purchaseId: 'p1', status: 'pending', test: true, invoiceUrl: null }));
    const controller = new CheckoutController({ start, availability: async () => ({ available: false }) } as never);
    await controller.createSession(
      { userId: 'user-1', email: 'a@namat.shara.sa', role: 'user', sessionId: 's' },
      {},
    );
    expect(start).toHaveBeenCalledWith('user-1', undefined);
  });

  it('reuses the open purchase when a second checkout hits the unique constraint', async () => {
    const existing = { id: 'p1', status: 'pending', providerState: 'invoice_open', moyasarInvoiceId: 'inv_1' };
    const createInvoice = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    const dataSource = {
      transaction: jest.fn(async () => {
        throw new QueryFailedError('insert', [], Object.assign(new Error('duplicate key value violates unique'), { code: '23505' }));
      }),
    };
    Object.assign(service, {
      dataSource,
      purchases: { findOne: async () => existing, save: async (row: unknown) => row },
      settings: {
        resolve: async () => ({
          checkoutAvailable: true,
          mode: 'test',
          secretKey: 'sk_test_example_key',
          publicBaseUrl: 'https://namat.shara.sa',
        }),
      },
      client: {
        createInvoice,
        fetchInvoice: async () => ({ ok: true, value: { id: 'inv_1', status: 'initiated', url: 'https://checkout.moyasar.test/inv', amount: NAMAT_PRICE_MINOR, currency: 'SAR', payments: [] } }),
      },
      purchasesService: {},
      packagesService: { defaultPublished: async () => null, requirePublishedByCode: async () => null },
    });
    const session = await service.start('user-1');
    expect(createInvoice).not.toHaveBeenCalled();
    expect(session.purchaseId).toBe('p1');
    expect(session.invoiceUrl).toContain('https://checkout.moyasar.test');
  });
});

describe('entitlement preservation', () => {
  async function serviceWith(entitlement: Partial<EntitlementEntity> | null) {
    const saveEntitlement = jest.fn(async (row: EntitlementEntity) => row);
    const savePurchase = jest.fn(async (row: PurchaseEntity) => row);
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: getRepositoryToken(PurchaseEntity), useValue: { findOne: async () => ({ id: 'p1', userId: 'u1', status: 'approved', provider: 'moyasar' }), save: savePurchase } },
        { provide: getRepositoryToken(EntitlementEntity), useValue: { findOne: async () => entitlement, save: saveEntitlement } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    return { service: moduleRef.get(PurchasesService), saveEntitlement, savePurchase };
  }

  it('revokes only the entitlement from the refunded purchase', async () => {
    const { service, saveEntitlement } = await serviceWith({
      userId: 'u1',
      status: 'active',
      grantSource: 'purchase',
      purchaseId: 'p1',
    } as EntitlementEntity);
    await service.markRefunded('p1');
    expect(saveEntitlement).toHaveBeenCalled();
    expect(saveEntitlement.mock.calls[0][0].status).toBe('revoked');
  });

  it('keeps a manual grant and a different purchase entitlement', async () => {
    const manual = await serviceWith({
      userId: 'u1',
      status: 'active',
      grantSource: 'manual',
      purchaseId: null,
    } as EntitlementEntity);
    await manual.service.markRefunded('p1');
    expect(manual.saveEntitlement).not.toHaveBeenCalled();

    const other = await serviceWith({
      userId: 'u1',
      status: 'active',
      grantSource: 'purchase',
      purchaseId: 'other',
    } as EntitlementEntity);
    await other.service.markRefunded('p1');
    expect(other.saveEntitlement).not.toHaveBeenCalled();
  });

  it('does not grant production entitlement for a test payment', async () => {
    const create = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        {
          provide: getRepositoryToken(PurchaseEntity),
          useValue: {
            findOne: async () => ({
              id: 'purchase_1',
              userId: 'u1',
              status: 'pending',
              provider: 'moyasar',
              moyasarInvoiceId: 'inv_1',
              amountMinor: NAMAT_PRICE_MINOR,
              currency: 'SAR',
            }),
            save: async (row: PurchaseEntity) => row,
          },
        },
        { provide: getRepositoryToken(EntitlementEntity), useValue: { findOne: async () => null, create, save: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    const result = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'test',
      payment: livePayment({ live: false, metadataPurchaseId: 'purchase_1' }),
    });
    expect(result.status).toBe('test_paid');
    expect(result.entitlementId).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});

describe('owner authorization and audit', () => {
  function context(roleKeys: string[], token: string) {
    const reflector = {
      getAllAndOverride: (key: string) => roleKeys.includes(key),
    } as unknown as Reflector;
    const guard = new AuthGuard(reflector, { validateAccessToken: jest.fn() } as never, {
      get: () => 'test-admin-token',
    } as never);
    return guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { authorization: `Bearer ${token}` }, method: 'POST' }),
      }),
    } as never);
  }

  it('rejects customer, staff, and admin-token access to owner routes', async () => {
    await expect(context([IS_ADMIN_KEY, IS_OWNER_KEY], 'test-admin-token')).rejects.toBeInstanceOf(UnauthorizedException);
    const reflector = {
      getAllAndOverride: (key: string) => key === IS_ADMIN_KEY || key === IS_OWNER_KEY,
    } as unknown as Reflector;
    const guard = new AuthGuard(reflector, {
      validateAccessToken: async () => ({ userId: 'staff', email: 'staff@namat.shara.sa', role: 'admin', sessionId: 's' }),
    } as never, { get: () => 'test-admin-token' } as never);
    await expect(guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: { authorization: 'Bearer staff-session' }, method: 'POST' }) }),
    } as never)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(context([IS_ADMIN_KEY, IS_OWNER_KEY], 'customer-token')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a cookie mutation that omits the CSRF header', async () => {
    const reflector = {
      getAllAndOverride: () => false,
    } as unknown as Reflector;
    const guard = new AuthGuard(reflector, { validateAccessToken: jest.fn() } as never, {
      get: () => 'test-admin-token',
    } as never);
    await expect(guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({
          headers: { cookie: 'namat_session=customer-session' },
          method: 'POST',
        }),
      }),
    } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('shows the actor email and result', async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AuditService,
        {
          provide: getRepositoryToken(AuditLogEntity),
          useValue: {
            find: async () => [{
              id: 'a1',
              action: 'purchase.refund',
              actorUserId: 'owner-1',
              actorEmail: null,
              actorType: 'owner',
              resourceType: 'purchase',
              resourceId: 'p1',
              metadata: { reason: 'customer request' },
              result: 'success',
              createdAt: new Date('2026-10-04T00:00:00.000Z'),
            }],
          },
        },
        {
          provide: getRepositoryToken(UserEntity),
          useValue: { find: async () => [{ id: 'owner-1', email: 'owner@namat.shara.sa' }] },
        },
      ],
    }).compile();
    const rows = await moduleRef.get(AuditService).list();
    expect(rows[0].actorEmail).toBe('owner@namat.shara.sa');
    expect(rows[0].result).toBe('success');
    expect(JSON.stringify(rows)).not.toContain('sk_');
  });
});

describe('signed release gate', () => {
  it('blocks an unverified IPA from publication and download', async () => {
    const row = {
      id: 'v1',
      version: '1.0.0',
      ipaPath: 'ipa/v1/1.0.0.ipa',
      checksum: 'abc',
      isActive: true,
      published: false,
      signatureVerified: false,
    } as AppVersionEntity;
    const service = Object.create(CompatibilityService.prototype) as CompatibilityService;
    Object.assign(service, {
      appVersions: { findOne: async () => row, save: async (value: AppVersionEntity) => value },
      storage: { readBuffer: async () => Buffer.from('abc') },
      audit: { record: jest.fn() },
    });
    row.checksum = createHash('sha256').update(Buffer.from('abc')).digest('hex');
    await expect(service.publishRelease('v1', { userId: 'owner', email: 'owner@namat.shara.sa' }, async () => ({ verified: false, reason: 'verifier_unavailable' }))).rejects.toMatchObject({
      response: { error: 'release_unverified', reason: 'verifier_unavailable' },
    });
    expect(service.customerDownloadAllowed(row)).toBe(false);
    const bytes = Buffer.from('not-a-zip');
    await expect(verifyIpaSignature(bytes)).resolves.toMatchObject({ verified: false, reason: 'not_a_zip' });
  });
});
