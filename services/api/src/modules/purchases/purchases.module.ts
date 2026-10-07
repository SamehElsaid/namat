import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  PurchaseEntity,
  EntitlementEntity,
} from '../../database/entities';
import { PurchasesService } from './purchases.service';
import { CheckoutController } from './checkout.controller';
import { PurchasesController } from './purchases.controller';
import { AuditModule } from '../audit/audit.module';
import { PaymentsModule } from '../payments/payments.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([PurchaseEntity, EntitlementEntity]),
    AuditModule,
    forwardRef(() => PaymentsModule),
  ],
  providers: [PurchasesService],
  controllers: [CheckoutController, PurchasesController],
  exports: [PurchasesService],
})
export class PurchasesModule {}
