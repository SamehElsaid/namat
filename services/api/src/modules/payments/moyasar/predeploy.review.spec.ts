import { createHash, generateKeyPairSync } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { NAMAT_PRICE_MINOR } from '@namat/shared';
import { IS_PUBLIC_KEY } from '../../../common/decorators/auth.decorators';
import { AuthGuard } from '../../../common/guards/auth.guard';
import { EntitlementEntity } from '../../../database/entities/entitlement.entity';
import { PurchaseEntity } from '../../../database/entities/purchase.entity';
import { AppVersionEntity } from '../../../database/entities/compatibility.entity';
import { AuditService } from '../../audit/audit.service';
import { PurchasesService } from '../../purchases/purchases.service';
import { CompatibilityService } from '../../compatibility/compatibility.service';
import {
  assessProvisioningProfile,
  signIpaAttestation,
  verifyIpaAttestation,
} from '../../compatibility/ipa-signature';
import { MoyasarClient } from './moyasar.client';
import { MoyasarCheckoutService } from './moyasar-checkout.service';
import {
  isMoyasarPaymentEvent,
  moyasarPaymentGrantsEntitlement,
  MoyasarPaymentView,
} from './moyasar-facts';
import { paymentConfigKey } from './secret-box';

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

const invoiceBody = (purchaseId = 'purchase_1') => ({
  invoices: [{
    id: 'inv_1',
    status: 'initiated',
    url: 'https://checkout.moyasar.test/inv',
    amount: NAMAT_PRICE_MINOR,
    currency: 'SAR',
    metadata: { namat_purchase_id: purchaseId },
    payments: [],
  }],
  meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1 },
});

function queryBuilder(decide: () => number) {
  const qb = {
    update: () => qb,
    set: () => qb,
    where: () => qb,
    andWhere: () => qb,
    execute: async () => ({ affected: decide() }),
  };
  return qb;
}

describe('pre-deployment payment review', () => {
  it('accepts only the official invoice list wrapper', async () => {
    const seen: string[] = [];
    const client = new MoyasarClient(async (url) => {
      seen.push(String(url));
      const body = String(url).includes('bad=1') ? [{ id: 'inv_1' }] : invoiceBody();
      return new Response(JSON.stringify(body), { status: 200 });
    });
    const page = await client.listInvoicesByPurchase('sk_test_example_key', 'purchase_1');
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.value.complete).toBe(true);
      expect(page.value.invoices[0].metadataPurchaseId).toBe('purchase_1');
    }
    expect(seen[0]).toContain('metadata%5Bnamat_purchase_id%5D=purchase_1');
    const client2 = new MoyasarClient(async () => new Response(JSON.stringify({ data: [] }), { status: 200 }));
    const wrong = await client2.listInvoicesByPurchase('sk_test_example_key', 'purchase_1');
    expect(wrong).toMatchObject({ ok: false, uncertain: true });
  });

  it('cancels a created invoice whose amount does not match the purchase snapshot', async () => {
    const purchase = {
      id: 'p1',
      userId: 'user-1',
      status: 'reserving',
      provider: 'moyasar',
      providerState: 'reserving',
      moyasarInvoiceId: null,
      amountMinor: NAMAT_PRICE_MINOR,
      currency: 'SAR',
      updatedAt: new Date(),
    };
    const cancelInvoice = jest.fn(async () => ({ ok: true, value: true }));
    const createInvoice = jest.fn(async () => ({
      ok: true,
      value: {
        id: 'inv_bad',
        status: 'initiated',
        url: 'https://checkout.moyasar.test/bad',
        amount: 100,
        currency: 'SAR',
        metadataPurchaseId: 'p1',
        payments: [],
      },
    }));
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      log: { warn: () => undefined },
      dataSource: { transaction: async () => purchase },
      purchases: {
        findOne: async () => purchase,
        save: async (row: typeof purchase) => row,
        createQueryBuilder: () => queryBuilder(() => 1),
      },
      settings: {
        resolve: async () => ({
          checkoutAvailable: true,
          mode: 'test',
          secretKey: 'sk_test_example_key',
          publicBaseUrl: 'https://namat.shara.sa',
        }),
      },
      client: { createInvoice, cancelInvoice, listInvoicesByPurchase: async () => ({ ok: true, value: { invoices: [], complete: true } }) },
      purchasesService: {},
      packagesService: { defaultPublished: async () => null, requirePublishedByCode: async () => null },
    });
    await expect(service.start('user-1')).rejects.toMatchObject({
      response: { error: 'checkout_unavailable' },
    });
    expect(cancelInvoice).toHaveBeenCalledWith('sk_test_example_key', 'inv_bad');
    expect(purchase.providerState).toBe('amount_mismatch');
    expect(purchase.status).toBe('rejected');
  });

  it('does not create a second invoice while a create is already claimed', async () => {
    const purchase = {
      id: 'p1',
      userId: 'user-1',
      status: 'reserving',
      provider: 'moyasar',
      providerState: 'reserving',
      moyasarInvoiceId: null,
      amountMinor: NAMAT_PRICE_MINOR,
      currency: 'SAR',
      updatedAt: new Date(),
    };
    let claims = 0;
    const createInvoice = jest.fn(async () => ({ ok: false, uncertain: true, status: null }));
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      log: { warn: () => undefined },
      dataSource: { transaction: async () => purchase },
      purchases: {
        findOne: async () => purchase,
        save: async (row: unknown) => row,
        createQueryBuilder: () => queryBuilder(() => {
          claims += 1;
          return claims === 1 ? 1 : 0;
        }),
      },
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
        listInvoicesByPurchase: async () => ({ ok: false, uncertain: true, status: null }),
        cancelInvoice: jest.fn(),
      },
      purchasesService: {},
      packagesService: { defaultPublished: async () => null, requirePublishedByCode: async () => null },
    });
    const [first, second] = await Promise.all([
      service.start('user-1'),
      service.start('user-1'),
    ]);
    expect(createInvoice).toHaveBeenCalledTimes(1);
    expect(first.status).toBe('pending');
    expect(second.purchaseId).toBe('p1');
    expect(second.invoiceUrl).toBeNull();
  });

  it('keeps an uncertain invoice response recoverable without another invoice', async () => {
    const purchase = {
      id: 'p1',
      status: 'unknown',
      providerState: 'unknown',
      moyasarInvoiceId: null,
      amountMinor: NAMAT_PRICE_MINOR,
      currency: 'SAR',
    };
    const createInvoice = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      log: { warn: () => undefined },
      dataSource: { transaction: async () => purchase },
      purchases: {
        findOne: async () => purchase,
        save: async (row: typeof purchase) => row,
        createQueryBuilder: () => queryBuilder(() => 1),
      },
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
        listInvoicesByPurchase: async () => ({ ok: false, uncertain: true, status: 503 }),
      },
      purchasesService: {},
      packagesService: { defaultPublished: async () => null, requirePublishedByCode: async () => null },
    });
    const session = await service.start('user-1');
    expect(createInvoice).not.toHaveBeenCalled();
    expect(session.invoiceUrl).toBeNull();
    expect(purchase.providerState).toBe('unknown');
  });

  it('adopts one matching invoice and ignores a foreign amount match', async () => {
    const purchase = {
      id: 'purchase_1',
      status: 'reserving',
      providerState: 'unknown',
      moyasarInvoiceId: null,
      amountMinor: NAMAT_PRICE_MINOR,
      currency: 'SAR',
    };
    const createInvoice = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      log: { warn: () => undefined },
      dataSource: { transaction: async () => purchase },
      purchases: {
        findOne: async () => purchase,
        save: async (row: typeof purchase) => row,
        createQueryBuilder: () => queryBuilder(() => 1),
      },
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
        listInvoicesByPurchase: async () => ({
          ok: true,
          value: {
            complete: true,
            invoices: [{
              id: 'inv_other',
              status: 'initiated',
              url: 'https://checkout.moyasar.test/other',
              amount: NAMAT_PRICE_MINOR,
              currency: 'SAR',
              metadataPurchaseId: 'someone_else',
              payments: [],
            }, {
              id: 'inv_1',
              status: 'initiated',
              url: 'https://checkout.moyasar.test/inv',
              amount: NAMAT_PRICE_MINOR,
              currency: 'SAR',
              metadataPurchaseId: 'purchase_1',
              payments: [],
            }],
          },
        }),
      },
      purchasesService: { applyMoyasarVerification: jest.fn() },
      packagesService: { defaultPublished: async () => null, requirePublishedByCode: async () => null },
    });
    const session = await service.start('user-1');
    expect(createInvoice).not.toHaveBeenCalled();
    expect(session.invoiceUrl).toBe('https://checkout.moyasar.test/inv');
    expect(purchase.moyasarInvoiceId).toBe('inv_1');
  });

  it('issues one refund and leaves a timeout pending', async () => {
    const purchase = {
      id: 'p1',
      status: 'approved',
      provider: 'moyasar',
      providerState: 'paid_live',
      providerMode: 'live',
      moyasarPaymentId: 'pay_1',
    } as PurchaseEntity;
    let claims = 0;
    const refundPayment = jest.fn(async () => ({ ok: false, uncertain: true, status: null }));
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      purchases: {
        save: jest.fn(),
        createQueryBuilder: () => queryBuilder(() => {
          claims += 1;
          return claims === 1 ? 1 : 0;
        }),
      },
      purchasesService: { getById: async () => purchase, markRefunded: jest.fn() },
      settings: { resolve: async () => ({ secretKey: 'sk_live_example_key' }) },
      client: {
        refundPayment,
        fetchPayment: async () => ({ ok: false, uncertain: true, status: null }),
      },
      nearpay: {},
      audit: { record: jest.fn() },
    });
    const actor = { userId: 'owner', email: 'owner@namat.shara.sa' };
    const [first, second] = await Promise.all([
      service.refund('p1', actor, 'customer request'),
      service.refund('p1', actor, 'customer request'),
    ]);
    expect(refundPayment).toHaveBeenCalledTimes(1);
    expect(first.confirmed).toBe(false);
    expect(second.confirmed).toBe(false);
    expect(purchase.providerState).toBe('paid_live');
  });

  it('does not regress a paid purchase or re-grant after refund', async () => {
    const savePurchase = jest.fn(async (row: PurchaseEntity) => row);
    const create = jest.fn();
    const saveEntitlement = jest.fn();
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        {
          provide: getRepositoryToken(PurchaseEntity),
          useValue: {
            findOne: async () => ({
              id: 'purchase_1',
              userId: 'u1',
              status: 'approved',
              provider: 'moyasar',
              moyasarInvoiceId: 'inv_1',
              amountMinor: NAMAT_PRICE_MINOR,
              currency: 'SAR',
            }),
            save: savePurchase,
          },
        },
        {
          provide: getRepositoryToken(EntitlementEntity),
          useValue: { findOne: async () => ({ id: 'ent_1', status: 'active' }), create, save: saveEntitlement },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    const service = moduleRef.get(PurchasesService);
    const failed = await service.applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ status: 'failed' }),
    });
    expect(failed.status).toBe('approved');
    const partial = await service.applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ status: 'refunded', refunded: 1000 }),
    });
    expect(partial.status).toBe('approved');
    expect(saveEntitlement).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('does not re-grant an entitlement after the purchase was refunded', async () => {
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
              status: 'refunded',
              provider: 'moyasar',
              moyasarInvoiceId: 'inv_1',
            }),
            save: jest.fn(),
          },
        },
        { provide: getRepositoryToken(EntitlementEntity), useValue: { findOne: async () => null, create, save: jest.fn() } },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    const result = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment(),
    });
    expect(result.status).toBe('refunded');
    expect(create).not.toHaveBeenCalled();
  });

  it('grants from an invoice association when payment metadata is absent', () => {
    const result = moyasarPaymentGrantsEntitlement({
      mode: 'live',
      payment: livePayment({ metadataPurchaseId: null }),
      purchaseId: 'purchase_1',
      invoiceId: 'inv_1',
    });
    expect(result.ok).toBe(true);
    expect(moyasarPaymentGrantsEntitlement({
      mode: 'live',
      payment: livePayment({ metadataPurchaseId: null, invoiceId: null }),
      purchaseId: 'purchase_1',
      invoiceId: 'inv_1',
    }).ok).toBe(false);
  });

  it('recognizes the documented failure webhook name', () => {
    expect(isMoyasarPaymentEvent('payment_faild')).toBe(true);
    expect(isMoyasarPaymentEvent('payment_failed')).toBe(true);
    expect(isMoyasarPaymentEvent('card_auth_failed')).toBe(false);
  });

  it('does not fetch a non-payment webhook', async () => {
    const fetchPayment = jest.fn();
    const service = Object.create(MoyasarCheckoutService.prototype) as MoyasarCheckoutService;
    Object.assign(service, {
      settings: { resolve: async () => ({ webhookSecret: 'webhook-secret-value', secretKey: 'sk_test_example_key', mode: 'test' }) },
      webhooks: { findOne: async () => null, save: async (row: unknown) => row, create: (row: unknown) => row },
      client: { fetchPayment },
      purchases: { findOne: async () => null },
      purchasesService: { applyMoyasarVerification: jest.fn() },
    });
    const result = await service.handleWebhook({
      id: 'evt_1',
      type: 'card_auth_failed',
      secret_token: 'webhook-secret-value',
      live: false,
      data: { id: 'ca_1', status: 'failed', amount: NAMAT_PRICE_MINOR, currency: 'SAR' },
    });
    expect(result).toMatchObject({ ignored: true });
    expect(fetchPayment).not.toHaveBeenCalled();
  });

  it('rejects a short or low-diversity encryption key', () => {
    expect(paymentConfigKey('0123456789abcdef')).toBeNull();
    expect(paymentConfigKey('payment-config-key-material-32b-x9')).toBeInstanceOf(Buffer);
  });
});

describe('pre-deployment release and migration review', () => {
  const future = '2027-06-01T00:00:00Z';
  const profile = (patch: string) => `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0"><dict>
  <key>ExpirationDate</key><date>${future}</date>
  <key>application-identifier</key><string>TEAM.com.namat.app</string>
  ${patch}
</dict></plist>`;

  it('rejects a development profile and an expired profile', () => {
    expect(assessProvisioningProfile(profile('<key>get-task-allow</key><true/><key>ProvisionedDevices</key><array><string>udid</string></array>')).reason).toBe('development_profile');
    expect(assessProvisioningProfile(profile('<key>get-task-allow</key><false/><key>ProvisionedDevices</key><array><string>udid</string></array>'), new Date('2028-01-01T00:00:00Z')).reason).toBe('profile_expired');
    expect(assessProvisioningProfile(profile('<key>get-task-allow</key><false/>')).reason).toBe('not_customer_distribution');
    expect(assessProvisioningProfile(profile('<key>ProvisionsAllDevices</key><true/>')).ok).toBe(true);
  });

  it('does not publish on codesign success alone or on an unbound checksum', async () => {
    const bytes = Buffer.from('ipa-bytes');
    const checksum = createHash('sha256').update(bytes).digest('hex');
    const row = {
      id: 'v1',
      version: '1.0.0',
      ipaPath: 'ipa/v1/1.0.0.ipa',
      checksum,
      isActive: true,
      published: false,
      signatureVerified: false,
      signatureStatus: 'unverified',
      signatureSha256: null,
      signatureExpiresAt: null,
    } as AppVersionEntity;
    const service = Object.create(CompatibilityService.prototype) as CompatibilityService;
    Object.assign(service, {
      appVersions: { findOne: async () => row, save: async (value: AppVersionEntity) => value },
      storage: { readBuffer: async () => bytes },
      audit: { record: jest.fn() },
    });
    await expect(service.publishRelease('v1', { userId: 'owner', email: 'owner@namat.shara.sa' }, async () => ({
      verified: true,
      reason: 'codesign_verified',
      sha256: checksum,
      bundleId: null,
      executable: null,
      profileExpiresAt: null,
    }))).rejects.toMatchObject({ response: { error: 'release_unverified' } });
    expect(row.published).toBe(false);
  });

  it('publishes a macOS attestation bound to the IPA SHA-256 and rejects a checkbox', async () => {
    const bytes = Buffer.from('ipa-bytes');
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const attestation = signIpaAttestation({
      sha256,
      bundleId: 'TEAM.com.namat.app',
      executable: 'Namat',
      profileExpiresAt: future,
    }, privatePem);
    expect(verifyIpaAttestation({ ...attestation, sha256: 'f'.repeat(64) }, publicPem, sha256).ok).toBe(false);
    const row = {
      id: 'v1',
      version: '1.0.0',
      ipaPath: 'ipa/v1/1.0.0.ipa',
      checksum: sha256,
      isActive: true,
      published: false,
      signatureVerified: false,
      signatureStatus: 'unverified',
      signatureSha256: null,
      signatureExpiresAt: null,
      signatureBundleId: null,
    } as AppVersionEntity;
    const service = Object.create(CompatibilityService.prototype) as CompatibilityService;
    Object.assign(service, {
      appVersions: { findOne: async () => row, save: async (value: AppVersionEntity) => value },
      storage: { readBuffer: async () => bytes },
      audit: { record: jest.fn() },
    });
    const saved = await service.publishRelease(
      'v1',
      { userId: 'owner', email: 'owner@namat.shara.sa' },
      async () => ({
        verified: false,
        reason: 'verifier_unavailable',
        sha256,
        bundleId: null,
        executable: null,
        profileExpiresAt: null,
      }),
      attestation,
      publicPem,
    );
    expect(saved.published).toBe(true);
    expect(saved.signatureStatus).toBe('attested_distribution');
    expect(saved.signatureSha256).toBe(sha256);
    expect(service.customerDownloadAllowed(saved)).toBe(true);
  });

  it('documents that migration down is not the rollback procedure', () => {
    const root = join(__dirname, '../../../database/migrations');
    const moyasar = readFileSync(join(root, '1710000008000-MoyasarOwnerControl.ts'), 'utf8');
    const evidence = readFileSync(join(root, '1710000009000-IpaVerificationEvidence.ts'), 'utf8');
    expect(moyasar).toContain('ADD COLUMN IF NOT EXISTS');
    expect(moyasar).toContain('DROP TABLE IF EXISTS support_notes');
    expect(moyasar).toContain('not the routine rollback');
    expect(evidence).toContain('"signatureSha256"');
    expect(evidence).toContain('not the routine rollback');
  });

  it('still rejects cookie mutations without the CSRF header', async () => {
    const reflector = {
      getAllAndOverride: (key: string) => key === IS_PUBLIC_KEY ? false : false,
    } as unknown as Reflector;
    const guard = new AuthGuard(reflector, { validateAccessToken: jest.fn() } as never, {
      get: () => 'test-admin-token',
    } as never);
    await expect(guard.canActivate({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ headers: { cookie: 'namat_session=abc' }, method: 'POST' }),
      }),
    } as never)).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
