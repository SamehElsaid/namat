import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  CompatibilityRuleEntity,
  AppVersionEntity,
} from '../../database/entities';
import { CompatibilityService } from './compatibility.service';
import { CompatibilityController } from './compatibility.controller';
import { StorageModule } from '../../storage/storage.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([CompatibilityRuleEntity, AppVersionEntity]),
    StorageModule,
    EntitlementsModule,
    AuditModule,
  ],
  providers: [CompatibilityService],
  controllers: [CompatibilityController],
  exports: [CompatibilityService],
})
export class CompatibilityModule {}
