import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  TelegramAccountEntity,
  TelegramLinkTokenEntity,
} from '../../database/entities';
import { AuditModule } from '../audit/audit.module';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { DevicesModule } from '../devices/devices.module';
import { PurchasesModule } from '../purchases/purchases.module';
import { SkinsModule } from '../skins/skins.module';
import { SupportModule } from '../support/support.module';
import { UsersModule } from '../users/users.module';
import { TelegramClient } from './telegram.client';
import { TelegramLinkingService } from './telegram-linking.service';
import { TelegramUpdateService } from './telegram.update';
import { TelegramNotificationChannel } from './telegram-notification.channel';
import { TelegramController } from './telegram.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([TelegramAccountEntity, TelegramLinkTokenEntity]),
    AuditModule,
    EntitlementsModule,
    DevicesModule,
    PurchasesModule,
    SkinsModule,
    SupportModule,
    UsersModule,
  ],
  providers: [
    TelegramClient,
    TelegramLinkingService,
    TelegramUpdateService,
    TelegramNotificationChannel,
  ],
  controllers: [TelegramController],
  exports: [TelegramClient, TelegramLinkingService],
})
export class TelegramModule {}
