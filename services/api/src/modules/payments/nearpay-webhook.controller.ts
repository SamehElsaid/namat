import {
  Controller,
  Headers,
  Post,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/decorators/auth.decorators';
import { PaymentsService } from './payments.service';

@Controller('payments/nearpay')
export class NearPayWebhookController {
  constructor(private readonly payments: PaymentsService) {}

  @Public()
  @Post('webhook')
  async webhook(
    @Req() req: RawBodyRequest<Request> & { body: unknown },
    @Headers() headers: Record<string, string | string[] | undefined>,
  ) {
    const raw =
      req.rawBody ??
      (typeof req.body === 'string'
        ? req.body
        : JSON.stringify(req.body ?? {}));
    return this.payments.handleNearPayWebhook(req.body, headers, raw);
  }
}
