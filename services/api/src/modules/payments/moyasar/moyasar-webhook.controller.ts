import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../../../common/decorators/auth.decorators';
import { MoyasarCheckoutService } from './moyasar-checkout.service';

@Controller('payments/moyasar')
export class MoyasarWebhookController {
  constructor(private readonly checkout: MoyasarCheckoutService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  webhook(@Body() body: unknown) {
    return this.checkout.handleWebhook(body);
  }

  /** Invoice callback has no documented signature. The body is only a hint. */
  @Public()
  @Post('invoice-callback')
  @HttpCode(200)
  invoiceCallback(@Body() body: unknown) {
    return this.checkout.handleInvoiceCallback(body);
  }
}
