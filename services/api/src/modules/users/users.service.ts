import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserEntity } from '../../database/entities/user.entity';
import { SessionEntity } from '../../database/entities/session.entity';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../../common/decorators/auth.decorators';

type Role = 'user' | 'admin' | 'owner';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    private readonly audit: AuditService,
  ) {}

  async findById(id: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { id } });
  }

  async requireById(id: string): Promise<UserEntity> {
    const u = await this.findById(id);
    if (!u) throw new NotFoundException('User not found');
    return u;
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.users.findOne({ where: { email: email.toLowerCase() } });
  }

  async list(limit = 100): Promise<UserEntity[]> {
    return this.users.find({
      relations: { entitlements: true },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  async setRole(
    actor: AuthUser,
    id: string,
    role: Role,
  ): Promise<UserEntity> {
    const u = await this.requireById(id);
    this.assertCanTouchOwner(actor, u, role);
    if (role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('Only an owner can assign the owner role');
    }
    const previous = u.role;
    u.role = role;
    const saved = await this.users.save(u);
    if (previous !== role) await this.revokeSessions(saved.id);
    await this.audit.record({
      action: 'user.role',
      actorUserId: actor.userId === 'admin-token' ? null : actor.userId,
      actorType: actor.role,
      resourceType: 'user',
      resourceId: saved.id,
      metadata: { from: previous, to: role },
    });
    return this.withoutPassword(saved);
  }

  async setActive(
    actor: AuthUser,
    id: string,
    isActive: boolean,
  ): Promise<UserEntity> {
    const u = await this.requireById(id);
    if (u.role === 'owner' && actor.role !== 'owner') {
      throw new ForbiddenException('Only an owner can disable an owner');
    }
    if (u.role === 'owner' && !isActive && u.id === actor.userId) {
      throw new ForbiddenException('An owner cannot disable their own account');
    }
    u.isActive = isActive;
    const saved = await this.users.save(u);
    if (!isActive) await this.revokeSessions(saved.id);
    await this.audit.record({
      action: isActive ? 'user.enable' : 'user.disable',
      actorUserId: actor.userId === 'admin-token' ? null : actor.userId,
      actorType: actor.role,
      resourceType: 'user',
      resourceId: saved.id,
    });
    return this.withoutPassword(saved);
  }

  /** Ends every open session so the account signs in again under its new state. */
  private async revokeSessions(userId: string): Promise<void> {
    await this.sessions
      .createQueryBuilder()
      .update(SessionEntity)
      .set({ revokedAt: new Date() })
      .where('"userId" = :userId AND "revokedAt" IS NULL', { userId })
      .execute();
  }

  private withoutPassword(user: UserEntity): UserEntity {
    return Object.assign(new UserEntity(), user, { passwordHash: null });
  }

  private assertCanTouchOwner(actor: AuthUser, target: UserEntity, next: Role) {
    if (target.role !== 'owner') return;
    if (actor.role !== 'owner') {
      throw new ForbiddenException('Admins cannot change an owner');
    }
    if (next !== 'owner' && target.id === actor.userId) {
      throw new ForbiddenException('An owner cannot demote their own account');
    }
  }
}
