import { BadRequestException } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import type { Repository } from 'typeorm';
import type { AnalyticsEventEntity } from '../../database/entities/analytics-event.entity';

describe('anonymous analytics limits', () => {
  const repo = {
    create: jest.fn((row) => row),
    save: jest.fn(async (row) => row),
  } as unknown as Repository<AnalyticsEventEntity>;
  const service = new AnalyticsService(repo);

  it('accepts a small event', async () => {
    await expect(
      service.track({ name: 'app_open', properties: { screen: 'home' } }),
    ).resolves.toMatchObject({ name: 'app_open' });
  });

  it('rejects oversized properties', async () => {
    await expect(
      service.track({ name: 'spam', properties: { blob: 'x'.repeat(5000) } }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects too many property keys', async () => {
    const props = Object.fromEntries(
      Array.from({ length: 21 }, (_, i) => [`k${i}`, i]),
    );
    await expect(
      service.track({ name: 'spam', properties: props }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
