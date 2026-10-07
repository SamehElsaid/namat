import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../../common/decorators/auth.decorators';
import { DataSource } from 'typeorm';

@Controller()
export class HealthController {
  constructor(private readonly dataSource: DataSource) {}

  @Public()
  @Get('health')
  health() {
    return {
      status: 'ok',
      service: '@namat/api',
      ts: new Date().toISOString(),
    };
  }

  @Public()
  @Get('ready')
  async ready() {
    let db = false;
    try {
      await this.dataSource.query('SELECT 1');
      db = true;
    } catch {
      db = false;
    }
    const body = {
      status: db ? 'ready' : 'degraded',
      database: db,
      ts: new Date().toISOString(),
    };
    // Load balancers and deploy checks read the status code, not the body.
    if (!db) throw new ServiceUnavailableException(body);
    return body;
  }
}
