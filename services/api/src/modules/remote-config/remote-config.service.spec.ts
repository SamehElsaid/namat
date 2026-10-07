import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RemoteConfigService } from './remote-config.service';
import { RemoteConfigEntity } from '../../database/entities/remote-config.entity';
import { AuditService } from '../audit/audit.service';

describe('RemoteConfig kill switch', () => {
  let service: RemoteConfigService;
  let repo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    const row: Partial<RemoteConfigEntity> = {
      id: 'rc1',
      key: 'default',
      killSwitchApply: false,
      killSwitchRestore: false,
      minAppVersion: '1.0.0',
      minIosVersion: '16.0',
      maintenanceMode: false,
      message: null,
      extras: null,
    };
    repo = {
      findOne: jest.fn(async () => ({ ...row })),
      create: jest.fn((x) => x),
      save: jest.fn(async (x) => ({ ...row, ...x })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RemoteConfigService,
        { provide: getRepositoryToken(RemoteConfigEntity), useValue: repo },
        {
          provide: AuditService,
          useValue: { record: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(RemoteConfigService);
  });

  it('exposes killSwitchApply=false by default', async () => {
    const pub = await service.getPublic();
    expect(pub.killSwitchApply).toBe(false);
    expect(pub.minAppVersion).toBe('1.0.0');
  });

  it('updates killSwitchApply via admin patch', async () => {
    const updated = await service.update(
      { killSwitchApply: true, message: 'Apply paused' },
      'admin-1',
    );
    expect(updated.killSwitchApply).toBe(true);
    expect(repo.save).toHaveBeenCalled();
    const pub = await service.getPublic();
    // getPublic reads again — mock returns updated from save path if findOne still old;
    // assert save payload instead:
    expect(repo.save.mock.calls[0][0].killSwitchApply).toBe(true);
    expect(pub).toBeDefined();
  });
});
