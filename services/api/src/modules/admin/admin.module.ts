import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeviceEntity,
  EntitlementEntity,
  PurchaseEntity,
  SupportNoteEntity,
  UserEntity,
} from '../../database/entities';
import { AdminController } from './admin.controller';
import { AdminOperationsController } from './admin-operations.controller';
import { OwnerControlController } from './owner-control.controller';
import { OwnerDashboardService } from './owner-dashboard.service';
import { AuthModule } from '../auth/auth.module';
import { PaymentsModule } from '../payments/payments.module';
import { SkinsModule } from '../skins/skins.module';
import { UsersModule } from '../users/users.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { CompatibilityModule } from '../compatibility/compatibility.module';
import { RemoteConfigModule } from '../remote-config/remote-config.module';
import { AnalyticsModule } from '../analytics/analytics.module';
import { AuditModule } from '../audit/audit.module';
import { DevicesModule } from '../devices/devices.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [
    SkinsModule,
    UsersModule,
    PurchasesModule,
    EntitlementsModule,
    CompatibilityModule,
    RemoteConfigModule,
    AnalyticsModule,
    AuditModule,
    DevicesModule,
    AiModule,
    AuthModule,
    PaymentsModule,
    TypeOrmModule.forFeature([
      UserEntity,
      PurchaseEntity,
      EntitlementEntity,
      DeviceEntity,
      SupportNoteEntity,
    ]),
  ],
  providers: [OwnerDashboardService],
  controllers: [AdminController, AdminOperationsController, OwnerControlController],
})
export class AdminModule {}
