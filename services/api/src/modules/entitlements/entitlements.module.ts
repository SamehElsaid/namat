import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  EntitlementEntity,
  DeviceEntity,
} from '../../database/entities';
import { EntitlementsService } from './entitlements.service';
import { EntitlementsController } from './entitlements.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EntitlementEntity, DeviceEntity]),
    AuditModule,
  ],
  providers: [EntitlementsService],
  controllers: [EntitlementsController],
  exports: [EntitlementsService],
})
export class EntitlementsModule {}
