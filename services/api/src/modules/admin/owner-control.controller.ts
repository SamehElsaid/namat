import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { AdminOnly, AuthUser, CurrentUser, OwnerOnly } from '../../common/decorators/auth.decorators';
import { OwnerDashboardService } from './owner-dashboard.service';
import { PaymentSettingsService } from '../payments/moyasar/payment-settings.service';
import { PaymentMode } from '../payments/moyasar/moyasar-facts';

class PaymentSettingsBody {
  @IsOptional()
  @IsBoolean()
  checkoutEnabled?: boolean;

  @IsOptional()
  @IsIn(['test', 'live'])
  mode?: PaymentMode;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  secretKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  publishableKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  webhookSecret?: string;

  @IsOptional()
  @IsBoolean()
  clearSecretKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearPublishableKey?: boolean;

  @IsOptional()
  @IsBoolean()
  clearWebhookSecret?: boolean;
}

class SupportNoteBody {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  purchaseId?: string;

  @IsString()
  @MinLength(3)
  @MaxLength(4000)
  body!: string;
}

class SupportNotePatch {
  @IsOptional()
  @IsIn(['open', 'resolved'])
  status?: 'open' | 'resolved';

  @IsOptional()
  @IsString()
  @MaxLength(255)
  outcome?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  body?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  reply?: string;
}

@AdminOnly()
@Controller('admin')
export class OwnerControlController {
  constructor(
    private readonly dashboard: OwnerDashboardService,
    private readonly paymentSettings: PaymentSettingsService,
  ) {}

  private actor(user: AuthUser) {
    return {
      userId: user.userId === 'admin-token' ? null : user.userId,
      email: user.userId === 'admin-token' ? null : user.email,
    };
  }

  @Get('overview')
  overview() {
    return this.dashboard.overview();
  }

  @Get('customers')
  customers(
    @Query('q') q = '',
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.dashboard.searchCustomers(q, Number(page), Number(limit));
  }

  @Get('customers/:id')
  customer(@Param('id') id: string) {
    return this.dashboard.customerDetail(id);
  }

  @Get('support-notes')
  notes(@Query('q') q = '') {
    return this.dashboard.listNotes(q);
  }

  @Post('support-notes')
  createNote(@CurrentUser() user: AuthUser, @Body() body: SupportNoteBody) {
    return this.dashboard.createNote(body, this.actor(user));
  }

  @Patch('support-notes/:id')
  updateNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: SupportNotePatch,
  ) {
    return this.dashboard.updateNote(id, body, this.actor(user));
  }

  @OwnerOnly()
  @Get('payment-settings')
  paymentSettingsView() {
    return this.paymentSettings.view();
  }

  @OwnerOnly()
  @Put('payment-settings')
  updatePaymentSettings(@CurrentUser() user: AuthUser, @Body() body: PaymentSettingsBody) {
    return this.paymentSettings.update(body, this.actor(user));
  }
}
