import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PurchaseEntity } from '../../database/entities/purchase.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { AuditService } from '../audit/audit.service';
import { PurchasesService } from './purchases.service';
import { PurchasesController } from './purchases.controller';
import { presentCustomerPurchase } from './customer-purchase';
import { presentDevice } from '../devices/devices.service';
import { DeviceEntity } from '../../database/entities/device.entity';

const secretRow = {
  id: 'p1',
  userId: 'u1',
  status: 'approved',
  amountMinor: 29900,
  currency: 'SAR',
  provider: 'nearpay',
  customerReferenceNumber: 'namat_ref_1',
  nearpayTransactionId: 'tx-secret',
  nearpayJobId: 'job-secret',
  nearpayMerchantId: 'merchant-secret',
  nearpayTerminalId: 'terminal-secret',
  retrievalReferenceNumber: 'rrn-secret',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
} as PurchaseEntity;

describe('customer purchase history', () => {
  it('exposes only safe purchase fields', () => {
    const view = presentCustomerPurchase(secretRow);
    const encoded = JSON.stringify(view);
    expect(view).toEqual({
      id: 'p1',
      reference: 'namat_ref_1',
      createdAt: '2026-04-01T00:00:00.000Z',
      amountMinor: 29900,
      currency: 'SAR',
      status: 'completed',
      paymentMethod: 'terminal',
      test: false,
    });
    expect(encoded).not.toContain('u1');
    expect(encoded).not.toContain('nearpay');
    expect(encoded).not.toContain('secret');
    expect(encoded).not.toContain('userId');
  });

  it('maps rejected and reversed purchases without provider data', () => {
    expect(
      presentCustomerPurchase({ ...secretRow, status: 'rejected' }).status,
    ).toBe('failed');
    expect(
      presentCustomerPurchase({ ...secretRow, status: 'reversed' }).status,
    ).toBe('refunded');
    expect(
      presentCustomerPurchase({ ...secretRow, status: 'refunded' }).status,
    ).toBe('refunded');
    expect(
      presentCustomerPurchase({ ...secretRow, status: 'pending' }).status,
    ).toBe('pending');
  });

  it('requireOwned queries id and user together and hides other accounts', async () => {
    const findOne = jest.fn(async (query: { where: { id: string; userId: string } }) => {
      if (query.where.id === 'p1' && query.where.userId === 'u1') return secretRow;
      return null;
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurchasesService,
        { provide: getRepositoryToken(PurchaseEntity), useValue: { findOne } },
        {
          provide: getRepositoryToken(EntitlementEntity),
          useValue: {},
        },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();
    const service = moduleRef.get(PurchasesService);

    await expect(service.requireOwned('p1', 'u1')).resolves.toBe(secretRow);
    await expect(service.requireOwned('p1', 'u2')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(findOne).toHaveBeenCalledWith({ where: { id: 'p1', userId: 'u2' } });
  });

  it('lists and reads only the authenticated user', async () => {
    const service = {
      getForUser: jest.fn(async (userId: string) => {
        expect(userId).toBe('u1');
        return [secretRow];
      }),
      requireOwned: jest.fn(async (id: string, userId: string) => {
        if (id !== 'p1' || userId !== 'u1') {
          throw new NotFoundException('Purchase not found');
        }
        return secretRow;
      }),
    };
    const controller = new PurchasesController(service as unknown as PurchasesService);
    const listed = await controller.mine({
      userId: 'u1',
      email: 'a@namat.shara.sa',
      role: 'user',
      sessionId: 's',
    });
    const encoded = JSON.stringify(listed);
    expect(listed.purchases).toHaveLength(1);
    expect(listed.purchases[0].reference).toBe('namat_ref_1');
    expect(encoded).not.toContain('terminal-secret');
    expect(encoded).not.toContain('nearpay');
    await expect(
      controller.one(
        { userId: 'u2', email: 'b@namat.shara.sa', role: 'user', sessionId: 's2' },
        'p1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('omits the device key fingerprint from the customer device payload', () => {
    const device = {
      id: 'd1',
      userId: 'u1',
      installationId: 'install',
      label: 'iPhone',
      appVersion: '0.1.0',
      iosVersion: '18.0',
      status: 'active',
      lastSeenAt: null,
      deactivatedAt: null,
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      publicKeyFingerprint: 'a'.repeat(64),
    } as DeviceEntity;
    const view = presentDevice(device);
    expect(view).not.toHaveProperty('publicKeyFingerprint');
    expect(JSON.stringify(view)).not.toContain('a'.repeat(64));
    expect(view.label).toBe('iPhone');
  });
});
