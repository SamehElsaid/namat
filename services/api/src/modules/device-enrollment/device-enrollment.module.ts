import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DeviceEnrollmentEntity,
  DeviceEntity,
  EntitlementEntity,
  SigningJobEntity,
  SigningLockEntity,
} from '../../database/entities';
import { StorageModule } from '../../storage/storage.module';
import { AuditModule } from '../audit/audit.module';
import {
  AppStoreConnectProvisioningProvider,
  UnconfiguredAppleProvisioningProvider,
} from './apple-provisioning';
import {
  AdminDeviceEnrollmentController,
  DeviceEnrollmentController,
} from './device-enrollment.controller';
import {
  APPLE_PROVISIONING,
  DeviceEnrollmentService,
  SIGNING_DISPATCHER,
} from './device-enrollment.service';
import {
  GitHubActionsSigningDispatcher,
  UnavailableSigningDispatcher,
} from './signing-dispatcher';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeviceEnrollmentEntity,
      SigningJobEntity,
      SigningLockEntity,
      EntitlementEntity,
      DeviceEntity,
    ]),
    AuditModule,
    StorageModule,
  ],
  controllers: [DeviceEnrollmentController, AdminDeviceEnrollmentController],
  providers: [
    DeviceEnrollmentService,
    {
      provide: APPLE_PROVISIONING,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = new AppStoreConnectProvisioningProvider({
          issuerId: config.get<string>('app.appleIssuerId') ?? '',
          keyId: config.get<string>('app.appleKeyId') ?? '',
          privateKey: config.get<string>('app.applePrivateKey') ?? '',
          bundleId: config.get<string>('app.appleBundleId') ?? 'sa.shara.namat.app',
          bundleResourceId: config.get<string>('app.appleBundleResourceId') ?? '',
          certificateId: config.get<string>('app.appleCertificateId') ?? '',
          deviceLimit: Number(config.get('app.appleAdHocDeviceLimit') ?? 100),
        });
        return provider.isConfigured()
          ? provider
          : new UnconfiguredAppleProvisioningProvider();
      },
    },
    {
      provide: SIGNING_DISPATCHER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const token = config.get<string>('app.githubDispatchToken') ?? '';
        if (!token) return new UnavailableSigningDispatcher();
        return new GitHubActionsSigningDispatcher({
          token,
          repository:
            config.get<string>('app.githubRepository') ??
            'sharahsa0-creator/namat',
          workflow:
            config.get<string>('app.githubSigningWorkflow') ??
            'ios-customer-sign.yml',
          ref: config.get<string>('app.githubDispatchRef') ?? 'main',
        });
      },
    },
  ],
  exports: [DeviceEnrollmentService],
})
export class DeviceEnrollmentModule {}
