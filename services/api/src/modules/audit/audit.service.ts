import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AuditLogEntity } from '../../database/entities/audit-log.entity';
import { UserEntity } from '../../database/entities/user.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLogEntity)
    private readonly logs: Repository<AuditLogEntity>,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  async record(input: {
    action: string;
    actorUserId?: string | null;
    actorEmail?: string | null;
    actorType?: string | null;
    resourceType?: string | null;
    resourceId?: string | null;
    metadata?: Record<string, unknown> | null;
    result?: 'success' | 'failure' | 'pending';
  }): Promise<AuditLogEntity> {
    return this.logs.save(
      this.logs.create({
        action: input.action,
        actorUserId: input.actorUserId ?? null,
        actorEmail: input.actorEmail ?? null,
        actorType: input.actorType ?? null,
        resourceType: input.resourceType ?? null,
        resourceId: input.resourceId ?? null,
        metadata: input.metadata ?? null,
        result: input.result ?? 'success',
      }),
    );
  }

  async list(limit = 100) {
    const rows = await this.logs.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const ids = [...new Set(rows.map((row) => row.actorUserId).filter((id): id is string => Boolean(id)))];
    const users = ids.length
      ? await this.users.find({ where: { id: In(ids) } })
      : [];
    const emailById = new Map(users.map((user) => [user.id, user.email]));
    return rows.map((row) => ({
      id: row.id,
      action: row.action,
      actorUserId: row.actorUserId,
      actorEmail:
        row.actorEmail ?? (row.actorUserId ? emailById.get(row.actorUserId) ?? null : null),
      actorType: row.actorType,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      metadata: row.metadata,
      result: row.result ?? 'success',
      createdAt: row.createdAt,
    }));
  }
}
