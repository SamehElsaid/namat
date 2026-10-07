import { Controller, Get, Param } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/auth.decorators';
import { PurchasesService } from './purchases.service';
import { presentCustomerPurchase } from './customer-purchase';

@Controller('purchases')
export class PurchasesController {
  constructor(private readonly purchases: PurchasesService) {}

  /** History for the authenticated account only. */
  @Get('mine')
  async mine(@CurrentUser() user: AuthUser) {
    const rows = await this.purchases.getForUser(user.userId);
    return { purchases: rows.map(presentCustomerPurchase) };
  }

  @Get(':id')
  async one(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    const row = await this.purchases.requireOwned(id, user.userId);
    return presentCustomerPurchase(row);
  }
}
