import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { PurchasesService } from './purchases.service';
import { PurchaseEntity } from '../../database/entities/purchase.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { AuditService } from '../audit/audit.service';

describe('PurchasesService entitlement on approve', () => {
  let service: PurchasesService;
  let purchases: {
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let entitlements: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    const purchase: Partial<PurchaseEntity> = {
      id: 'p1',
      userId: 'u1',
      status: 'pending',
      customerReferenceNumber: 'namat_ref',
      amountMinor: 29900,
      currency: 'SAR',
    };
    purchases = {
      findOne: jest.fn(async () => ({ ...purchase })),
      save: jest.fn(async (x) => x),
    };
    entitlements = {
      findOne: jest.fn(async () => null),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ id: 'e1', ...x })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: getRepositoryToken(PurchaseEntity), useValue: purchases },
        {
          provide: getRepositoryToken(EntitlementEntity),
          useValue: entitlements,
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get(PurchasesService);
  });

  it('creates entitlement idempotently on approved payment', async () => {
    const first = await service.applyPaymentEvent({
      customerReferenceNumber: 'namat_ref',
      transactionId: 'tx-1',
      status: 'approved',
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      expectedMerchantId: 'm1',
      terminalId: 't1',
      retrievalReferenceNumber: null,
    });
    expect(first.entitlementId).toBe('e1');

    entitlements.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status: 'active',
    });
    purchases.findOne.mockResolvedValue({
      id: 'p1',
      userId: 'u1',
      status: 'approved',
      customerReferenceNumber: 'namat_ref',
    });

    const second = await service.applyPaymentEvent({
      customerReferenceNumber: 'namat_ref',
      transactionId: 'tx-1',
      status: 'approved',
      amountMinor: 29900,
      currency: 'SAR',
      merchantId: 'm1',
      terminalId: 't1',
      retrievalReferenceNumber: null,
    });
    expect(second.entitlementId).toBe('e1');
    // save for entitlement create only once on first call
    expect(entitlements.save).toHaveBeenCalledTimes(1);
  });

  it('does not grant entitlement when amount, currency, or merchant is tampered', async () => {
    const result = await service.applyPaymentEvent({
      customerReferenceNumber: 'namat_ref',
      transactionId: 'tx-tamper',
      status: 'approved',
      amountMinor: 100,
      currency: 'USD',
      merchantId: 'attacker',
      expectedMerchantId: 'm1',
      terminalId: null,
      retrievalReferenceNumber: null,
    });
    expect(result.entitlementId).toBeNull();
    expect(entitlements.save).not.toHaveBeenCalled();
    expect(purchases.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' }),
    );
  });
});
