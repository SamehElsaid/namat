import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FORBIDDEN_PAYLOAD_FIELDS } from '@namat/shared';
import { AnalyticsEventEntity } from '../../database/entities/analytics-event.entity';

const FORBIDDEN = new Set(
  FORBIDDEN_PAYLOAD_FIELDS.map((f) => f.toLowerCase()),
);

/** The events endpoint is anonymous, so each row stays small. */
const MAX_PROPERTY_KEYS = 20;
const MAX_PROPERTIES_BYTES = 2048;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(AnalyticsEventEntity)
    private readonly events: Repository<AnalyticsEventEntity>,
  ) {}

  async track(input: {
    name: string;
    userId?: string;
    installationId?: string;
    properties?: Record<string, unknown>;
  }): Promise<AnalyticsEventEntity> {
    if (!/^[a-zA-Z][a-zA-Z0-9_./-]{1,62}$/.test(input.name)) {
      throw new BadRequestException('Invalid event name');
    }
    const props = input.properties ?? {};
    if (typeof props !== 'object' || Array.isArray(props)) {
      throw new BadRequestException('Analytics properties must be an object');
    }
    if (Object.keys(props).length > MAX_PROPERTY_KEYS) {
      throw new BadRequestException(
        `Analytics events allow at most ${MAX_PROPERTY_KEYS} properties`,
      );
    }
    if (Buffer.byteLength(JSON.stringify(props), 'utf8') > MAX_PROPERTIES_BYTES) {
      throw new BadRequestException(
        `Analytics properties must be at most ${MAX_PROPERTIES_BYTES} bytes`,
      );
    }
    for (const key of Object.keys(props)) {
      if (FORBIDDEN.has(key.toLowerCase())) {
        throw new BadRequestException(
          `Analytics property "${key}" is forbidden`,
        );
      }
    }
    return this.events.save(
      this.events.create({
        name: input.name,
        userId: input.userId ?? null,
        installationId: input.installationId ?? null,
        properties: props,
      }),
    );
  }

  async list(limit = 200): Promise<AnalyticsEventEntity[]> {
    return this.events.find({
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
