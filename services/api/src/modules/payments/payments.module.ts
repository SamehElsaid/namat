import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PaymentCredentialEntity,
  PaymentSettingsEntity,
  PaymentWebhookEventEntity,
  PurchaseEntity,
} from '../../database/entities';
import { NearPayProvider } from './nearpay/nearpay.provider';
import { PaymentsService } from './payments.service';
import { NearPayWebhookController } from './nearpay-webhook.controller';
import { MoyasarWebhookController } from './moyasar/moyasar-webhook.controller';
import { MoyasarClient } from './moyasar/moyasar.client';
import { MoyasarCheckoutService } from './moyasar/moyasar-checkout.service';
import { PaymentSettingsService } from './moyasar/payment-settings.service';
import { PurchasesModule } from '../purchases/purchases.module';
import { PackagesModule } from '../packages/packages.module';
import { AuditModule } from '../audit/audit.module';
import { PAYMENT_PROVIDER } from './payment-provider.interface';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaymentWebhookEventEntity,
      PaymentSettingsEntity,
      PaymentCredentialEntity,
      PurchaseEntity,
    ]),
    AuditModule,
    PackagesModule,
    forwardRef(() => PurchasesModule),
  ],
  providers: [
    NearPayProvider,
    PaymentsService,
    MoyasarClient,
    PaymentSettingsService,
    MoyasarCheckoutService,
    { provide: PAYMENT_PROVIDER, useExisting: NearPayProvider },
  ],
  controllers: [NearPayWebhookController, MoyasarWebhookController],
  exports: [
    PaymentsService,
    NearPayProvider,
    PAYMENT_PROVIDER,
    PaymentSettingsService,
    MoyasarCheckoutService,
  ],
})
export class PaymentsModule {}
