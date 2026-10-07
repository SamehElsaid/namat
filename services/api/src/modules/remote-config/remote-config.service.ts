import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RemoteConfigEntity } from '../../database/entities/remote-config.entity';
import { RemoteConfigPublic } from '@namat/shared';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class RemoteConfigService {
  constructor(
    @InjectRepository(RemoteConfigEntity)
    private readonly configs: Repository<RemoteConfigEntity>,
    private readonly audit: AuditService,
  ) {}

  async getDefault(): Promise<RemoteConfigEntity> {
    let row = await this.configs.findOne({ where: { key: 'default' } });
    if (!row) {
      row = await this.configs.save(
        this.configs.create({
          key: 'default',
          killSwitchApply: false,
          killSwitchRestore: false,
          minAppVersion: '0.1.0',
          minIosVersion: '16.0',
          maintenanceMode: false,
          message: null,
          extras: null,
        }),
      );
    }
    return row;
  }

  async getPublic(): Promise<RemoteConfigPublic> {
    const row = await this.getDefault();
    return {
      killSwitchApply: row.killSwitchApply,
      // Restore of a valid local original stays available. This flag is not an owner control.
      killSwitchRestore: false,
      minAppVersion: row.minAppVersion,
      minIosVersion: row.minIosVersion,
      maintenanceMode: row.maintenanceMode,
      message: row.message ?? undefined,
    };
  }

  async update(
    patch: Partial<
      Pick<
        RemoteConfigEntity,
        | 'killSwitchApply'
        | 'killSwitchRestore'
        | 'minAppVersion'
        | 'minIosVersion'
        | 'maintenanceMode'
        | 'message'
        | 'extras'
      >
    >,
    actorUserId: string | null,
  ): Promise<RemoteConfigEntity> {
    const row = await this.getDefault();
    const { killSwitchRestore: _ignored, ...rest } = patch;
    Object.assign(row, rest);
    row.killSwitchRestore = false;
    const saved = await this.configs.save(row);
    await this.audit.record({
      action: 'remote_config.update',
      actorUserId,
      actorType: 'owner',
      resourceType: 'remote_config',
      resourceId: saved.id,
      result: 'success',
      metadata: { ...rest, killSwitchRestore: false } as Record<string, unknown>,
    });
    return saved;
  }
}
