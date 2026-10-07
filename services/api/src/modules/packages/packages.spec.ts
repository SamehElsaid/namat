import { BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test } from '@nestjs/testing';
import { NAMAT_PRICE_MINOR } from '@namat/shared';
import { AuditService } from '../audit/audit.service';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { PackageEntity } from '../../database/entities/package.entity';
import { PurchaseEntity } from '../../database/entities/purchase.entity';
import { PackagesService } from './packages.service';
import { PurchasesService } from '../purchases/purchases.service';
import { MoyasarPaymentView } from '../payments/moyasar/moyasar-facts';

const actor = { userId: 'owner-1', email: 'owner@namat.shara.sa' };

function livePayment(patch: Partial<MoyasarPaymentView> = {}): MoyasarPaymentView {
  return {
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
  };
}

describe('PackagesService (owner-editable products)', () => {
  function serviceWith(rows: Partial<PackageEntity>[]) {
    const store = rows.map((r) => ({ ...r })) as PackageEntity[];
    const repo = {
      find: jest.fn(async () => store),
      findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
        store.find((p) =>
          Object.entries(where).every(([k, v]) => (p as Record<string, unknown>)[k] === v),
        ) ?? null,
      ),
      create: jest.fn((row: Partial<PackageEntity>) => ({ id: 'pkg-new', ...row })),
      save: jest.fn(async (row: PackageEntity) => row),
    };
    const audit = { record: jest.fn() };
    const service = new PackagesService(repo as never, audit as never);
    return { service, repo, audit };
  }

  it('rejects a price below the floor', async () => {
    const { service } = serviceWith([]);
    await expect(
      service.create(
        { code: 'cheap', nameEn: 'Cheap', nameAr: 'رخيص', priceMinor: 50 },
        actor,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a duplicate code', async () => {
    const { service } = serviceWith([{ code: 'taken', priceMinor: 29900 }]);
    await expect(
      service.create(
        { code: 'taken', nameEn: 'Dup', nameAr: 'مكرر', priceMinor: 29900 },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('normalises currency and defaults on create, and records an audit entry', async () => {
    const { service, audit } = serviceWith([]);
    const saved = await service.create(
      { code: 'pro', nameEn: 'Pro', nameAr: 'احترافي', priceMinor: 49900, currency: 'sar' },
      actor,
    );
    expect(saved.currency).toBe('SAR');
    expect(saved.maxDevices).toBe(1);
    expect(saved.isPublished).toBe(false);
    expect(audit.record).toHaveBeenCalled();
  });

  it('updates the price and publish flag after validation', async () => {
    const { service } = serviceWith([
      { id: 'pkg-1', code: 'namat-lifetime', priceMinor: 29900, currency: 'SAR', maxDevices: 1, isPublished: true },
    ]);
    const saved = await service.update('pkg-1', { priceMinor: 39900, isPublished: false }, actor);
    expect(saved.priceMinor).toBe(39900);
    expect(saved.isPublished).toBe(false);
    await expect(
      service.update('pkg-1', { priceMinor: 10 }, actor),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists only published packages for the storefront', async () => {
    const { service } = serviceWith([
      { id: 'a', code: 'a', isPublished: true, sortOrder: 0, priceMinor: 100 },
    ]);
    const rows = await service.listPublished();
    expect(rows).toHaveLength(1);
  });
});

describe('payment amount binds to the purchased package price', () => {
  function verificationModule(purchase: Partial<PurchaseEntity>, onEntitlement: jest.Mock) {
    return Test.createTestingModule({
      providers: [
        PurchasesService,
        {
          provide: getRepositoryToken(PurchaseEntity),
          useValue: {
            findOne: async () => ({ provider: 'moyasar', ...purchase }),
            save: async (row: PurchaseEntity) => row,
          },
        },
        {
          provide: getRepositoryToken(EntitlementEntity),
          useValue: { findOne: async () => null, create: onEntitlement, save: async (r: unknown) => r },
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
  }

  it('rejects a live payment whose amount differs from the package price', async () => {
    const create = jest.fn();
    const moduleRef = await verificationModule(
      {
        id: 'purchase_1',
        userId: 'u1',
        status: 'pending',
        moyasarInvoiceId: 'inv_1',
        amountMinor: 49900,
        currency: 'SAR',
        packageCode: 'pro',
      },
      create,
    );
    const result = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ amount: NAMAT_PRICE_MINOR, metadataPurchaseId: 'purchase_1' }),
    });
    expect(result.status).toBe('rejected');
    expect(create).not.toHaveBeenCalled();
  });

  it('grants an entitlement with the package devices and expiry on a matching live payment', async () => {
    const create = jest.fn((row) => ({ id: 'ent_1', ...row }));
    const moduleRef = await verificationModule(
      {
        id: 'purchase_1',
        userId: 'u1',
        status: 'pending',
        moyasarInvoiceId: 'inv_1',
        amountMinor: 49900,
        currency: 'SAR',
        packageCode: 'pro',
        packageMaxDevices: 3,
        packageDurationDays: 365,
      },
      create,
    );
    const result = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ amount: 49900, metadataPurchaseId: 'purchase_1' }),
    });
    expect(result.status).toBe('approved');
    expect(create).toHaveBeenCalledTimes(1);
    const granted = create.mock.calls[0][0];
    expect(granted.maxDevices).toBe(3);
    expect(granted.plan).toBe('subscription');
    expect(granted.packageCode).toBe('pro');
    expect(granted.expiresAt).toBeInstanceOf(Date);
  });

  it('grants a lifetime entitlement with no expiry when the package has no duration', async () => {
    const create = jest.fn((row) => ({ id: 'ent_1', ...row }));
    const moduleRef = await verificationModule(
      {
        id: 'purchase_1',
        userId: 'u1',
        status: 'pending',
        moyasarInvoiceId: 'inv_1',
        amountMinor: NAMAT_PRICE_MINOR,
        currency: 'SAR',
        packageCode: 'namat-lifetime',
        packageMaxDevices: 1,
        packageDurationDays: null,
      },
      create,
    );
    const result = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ amount: NAMAT_PRICE_MINOR, metadataPurchaseId: 'purchase_1' }),
    });
    expect(result.status).toBe('approved');
    const granted = create.mock.calls[0][0];
    expect(granted.plan).toBe('lifetime');
    expect(granted.expiresAt).toBeNull();
  });

  it('keeps verifying against the purchase snapshot after the package price changes', async () => {
    const create = jest.fn((row) => ({ id: 'ent_1', ...row }));
    const moduleRef = await verificationModule(
      {
        id: 'purchase_1',
        userId: 'u1',
        status: 'pending',
        moyasarInvoiceId: 'inv_1',
        amountMinor: 49900,
        currency: 'SAR',
        packageCode: 'pro',
      },
      create,
    );
    // Admin later raised the package to 99900; the open purchase stays at 49900.
    const mismatchedCurrentPackagePrice = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ amount: 99900, metadataPurchaseId: 'purchase_1' }),
    });
    expect(mismatchedCurrentPackagePrice.status).toBe('rejected');
    expect(create).not.toHaveBeenCalled();

    const matchingSnapshot = await moduleRef.get(PurchasesService).applyMoyasarVerification({
      purchaseId: 'purchase_1',
      mode: 'live',
      payment: livePayment({ amount: 49900, metadataPurchaseId: 'purchase_1' }),
    });
    expect(matchingSnapshot.status).toBe('approved');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
