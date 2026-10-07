import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RemoteConfigEntity } from '../../database/entities';
import { RemoteConfigService } from './remote-config.service';
import { RemoteConfigController } from './remote-config.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [TypeOrmModule.forFeature([RemoteConfigEntity]), AuditModule],
  providers: [RemoteConfigService],
  controllers: [RemoteConfigController],
  exports: [RemoteConfigService],
})
export class RemoteConfigModule {}
