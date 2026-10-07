import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DevicesService } from '../devices/devices.service';
import { DeviceEntity } from '../../database/entities/device.entity';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { createHash } from 'crypto';
import { BadRequestException, ForbiddenException } from '@nestjs/common';

describe('DevicesService device limit', () => {
  let service: DevicesService;
  let devices: jest.Mocked<
    Pick<Repository<DeviceEntity>, 'findOne' | 'find' | 'create' | 'save'>
  > & { manager: { transaction: jest.Mock; getRepository: jest.Mock; connection: unknown } };
  let entitlements: jest.Mocked<Pick<Repository<EntitlementEntity>, 'findOne'>>;

  beforeEach(async () => {
    const manager = {
      connection: { options: { type: 'better-sqlite3' } },
      transaction: jest.fn(async (fn: (m: unknown) => Promise<unknown>) => fn(manager)),
      getRepository: (entity: { name?: string }) =>
        entity?.name === 'EntitlementEntity' ? entitlements : devices,
    };
    devices = {
      findOne: jest.fn(),
      find: jest.fn(async () => []),
      create: jest.fn((x) => x as DeviceEntity) as never,
      save: jest.fn(async (x) => ({ id: 'd1', ...x } as DeviceEntity)) as never,
      manager,
    } as typeof devices;
    entitlements = {
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DevicesService,
        { provide: getRepositoryToken(DeviceEntity), useValue: devices },
        {
          provide: getRepositoryToken(EntitlementEntity),
          useValue: entitlements,
        },
      ],
    }).compile();

    service = module.get(DevicesService);
  });

  it('requires active entitlement', async () => {
    entitlements.findOne.mockResolvedValue(null);
    await expect(
      service.register({
        userId: 'u1',
        installationId: 'install-001',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks a second active installation', async () => {
    entitlements.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status: 'active',
      maxDevices: 1,
    } as EntitlementEntity);
    devices.findOne.mockResolvedValue(null);
    devices.find.mockResolvedValue([{ id: 'd-existing', status: 'active' } as DeviceEntity]);

    await expect(
      service.register({
        userId: 'u1',
        installationId: 'install-003',
        appVersion: '1.0.0',
        iosVersion: '17.0',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows registration under the limit', async () => {
    entitlements.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status: 'active',
      maxDevices: 1,
    } as EntitlementEntity);
    devices.findOne.mockResolvedValue(null);
    devices.find.mockResolvedValue([]);

    const row = await service.register({
      userId: 'u1',
      installationId: 'install-002',
    });
    expect(row.installationId).toBe('install-002');
    expect(devices.save).toHaveBeenCalled();
  });

  it('allows only one active iPhone when two registrations overlap', async () => {
    const active: DeviceEntity[] = [];
    entitlements.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status: 'active',
      maxDevices: 1,
    } as EntitlementEntity);
    devices.findOne.mockResolvedValue(null);
    devices.find.mockImplementation(async () => active.slice());
    devices.save.mockImplementation(async (row) => {
      const saved = { id: `d-${active.length + 1}`, status: 'active', ...row } as DeviceEntity;
      active.push(saved);
      return saved;
    });
    const results = await Promise.allSettled([
      service.register({ userId: 'u1', installationId: 'install-a' }),
      service.register({ userId: 'u1', installationId: 'install-b' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects a mismatched NAMAT installation token', async () => {
    entitlements.findOne.mockResolvedValue({
      id: 'e1',
      userId: 'u1',
      status: 'active',
      maxDevices: 1,
    } as EntitlementEntity);
    devices.findOne.mockResolvedValue({
      id: 'd1',
      userId: 'u1',
      status: 'active',
      installationId: 'install-001',
      installationTokenHash: createHash('sha256').update('token-a').digest('hex'),
    } as DeviceEntity);
    await expect(
      service.register({
        userId: 'u1',
        installationId: 'install-001',
        installationToken: 'token-b',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
