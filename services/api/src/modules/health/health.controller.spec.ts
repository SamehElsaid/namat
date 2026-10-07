import { ServiceUnavailableException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { HealthController } from './health.controller';

describe('readiness', () => {
  it('returns ready when the database answers', async () => {
    const ds = { query: jest.fn(async () => [1]) } as unknown as DataSource;
    await expect(new HealthController(ds).ready()).resolves.toMatchObject({
      status: 'ready',
      database: true,
    });
  });

  it('fails with 503 when the database is down', async () => {
    const ds = {
      query: jest.fn(async () => {
        throw new Error('down');
      }),
    } as unknown as DataSource;
    await expect(new HealthController(ds).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
