import { ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { UsersService } from './users.service';
import { UserEntity } from '../../database/entities/user.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators/auth.decorators';

describe('owner role boundaries', () => {
  const owner: AuthUser = {
    userId: 'owner-1',
    email: 'owner@example.com',
    role: 'owner',
    sessionId: 's1',
  };
  const admin: AuthUser = {
    userId: 'admin-1',
    email: 'admin@example.com',
    role: 'admin',
    sessionId: 's2',
  };

  let service: UsersService;
  const users = {
    findOne: jest.fn(),
    save: jest.fn(async (row: UserEntity) => row),
  };
  const audit = { record: jest.fn(async () => ({})) };
  const revoke = { execute: jest.fn(async () => ({})) };
  const sessions = {
    createQueryBuilder: jest.fn(() => ({
      update: () => ({ set: () => ({ where: () => revoke }) }),
    })),
  };

  beforeEach(async () => {
    users.findOne.mockReset();
    const moduleRef = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(UserEntity), useValue: users },
        { provide: getRepositoryToken(SessionEntity), useValue: sessions },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = moduleRef.get(UsersService);
  });

  it('blocks an admin from demoting, disabling, or assigning owner', async () => {
    users.findOne.mockResolvedValue({
      id: 'owner-1',
      role: 'owner',
      isActive: true,
    });
    await expect(service.setRole(admin, 'owner-1', 'admin')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.setActive(admin, 'owner-1', false)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    users.findOne.mockResolvedValue({ id: 'u2', role: 'user', isActive: true });
    await expect(service.setRole(admin, 'u2', 'owner')).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows an owner to change another admin', async () => {
    users.findOne.mockResolvedValue({ id: 'a2', role: 'admin', isActive: true });
    const saved = await service.setRole(owner, 'a2', 'user');
    expect(saved.role).toBe('user');
  });
});
