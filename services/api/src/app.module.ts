import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { ALL_ENTITIES } from './database/entities';
import { AuthGuard } from './common/guards/auth.guard';
import { PrivacyGuard } from './common/privacy/privacy.guard';
import { StorageModule } from './storage/storage.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PurchasesModule } from './modules/purchases/purchases.module';
import { PackagesModule } from './modules/packages/packages.module';
import { SupportModule } from './modules/support/support.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { DevicesModule } from './modules/devices/devices.module';
import { DeviceEnrollmentModule } from './modules/device-enrollment/device-enrollment.module';
import { SkinsModule } from './modules/skins/skins.module';
import { RemoteConfigModule } from './modules/remote-config/remote-config.module';
import { CompatibilityModule } from './modules/compatibility/compatibility.module';
import { AiModule } from './modules/ai/ai.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { AdminModule } from './modules/admin/admin.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { TelegramModule } from './modules/telegram/telegram.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const isTest = process.env.NODE_ENV === 'test';
        const driver = process.env.DATABASE_DRIVER;
        if (isTest || driver === 'sqlite') {
          return {
            type: 'better-sqlite3' as const,
            database: process.env.SQLITE_PATH ?? ':memory:',
            entities: ALL_ENTITIES,
            synchronize: true,
            logging: false,
          };
        }
        const db = config.get('app.database') as {
          host: string;
          port: number;
          username: string;
          password: string;
          database: string;
          ssl: boolean;
          synchronize: boolean;
        };
        return {
          type: 'postgres' as const,
          host: db.host,
          port: db.port,
          username: db.username,
          password: db.password,
          database: db.database,
          ssl: db.ssl ? { rejectUnauthorized: false } : false,
          entities: ALL_ENTITIES,
          synchronize: db.synchronize,
          // When sync is off (production), apply pending migrations on boot.
          migrationsRun: !db.synchronize,
          migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
          logging: process.env.TYPEORM_LOGGING === 'true',
        };
      },
    }),
    StorageModule,
    AuthModule,
    UsersModule,
    PurchasesModule,
    PackagesModule,
    SupportModule,
    PaymentsModule,
    EntitlementsModule,
    DevicesModule,
    DeviceEnrollmentModule,
    SkinsModule,
    RemoteConfigModule,
    CompatibilityModule,
    AiModule,
    AnalyticsModule,
    AdminModule,
    AuditModule,
    HealthModule,
    NotificationsModule,
    TelegramModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: PrivacyGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
