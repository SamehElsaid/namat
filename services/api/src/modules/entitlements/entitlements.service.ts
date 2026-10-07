import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EntitlementEntity } from '../../database/entities/entitlement.entity';
import { DeviceEntity } from '../../database/entities/device.entity';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EntitlementsService {
  constructor(
    @InjectRepository(EntitlementEntity)
    private readonly entitlements: Repository<EntitlementEntity>,
    @InjectRepository(DeviceEntity)
    private readonly devices: Repository<DeviceEntity>,
    private readonly audit: AuditService,
  ) {}

  async getForUser(userId: string): Promise<{
    entitlement: EntitlementEntity | null;
    activeDevices: number;
  }> {
    const entitlement = await this.entitlements.findOne({ where: { userId } });
    const activeDevices = await this.devices.count({
      where: { userId, status: 'active' },
    });
    return { entitlement, activeDevices };
  }

  async revoke(
    userId: string,
    reason: string,
    actorUserId: string | null,
    actorEmail?: string | null,
  ): Promise<EntitlementEntity> {
    const clean = reason.trim();
    if (clean.length < 3) {
      throw new BadRequestException('A revocation reason is required');
    }
    const ent = await this.entitlements.findOne({ where: { userId } });
    if (!ent) throw new NotFoundException('Entitlement not found');
    ent.status = 'revoked';
    ent.revokedAt = new Date();
    ent.revokeReason = clean;
    const saved = await this.entitlements.save(ent);
    await this.audit.record({
      action: 'entitlement.revoke',
      actorUserId,
      actorEmail,
      actorType: 'owner',
      resourceType: 'entitlement',
      resourceId: saved.id,
      result: 'success',
      metadata: { reason: clean, grantSource: saved.grantSource ?? null },
    });
    return saved;
  }

  async listAll(limit = 100): Promise<EntitlementEntity[]> {
    return this.entitlements.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
