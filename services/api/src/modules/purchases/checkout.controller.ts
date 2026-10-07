import { Body, Controller, Get, Param, Post, Query, ServiceUnavailableException } from '@nestjs/common';
import { IsOptional, IsString, Length, Matches } from 'class-validator';
import { CurrentUser, AuthUser, Public } from '../../common/decorators/auth.decorators';
import { MoyasarCheckoutService } from '../payments/moyasar/moyasar-checkout.service';
import { CHECKOUT_UNAVAILABLE_AR } from '../payments/moyasar/moyasar-facts';

class CreateSessionBody {
  @IsOptional()
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z0-9-]+$/)
  packageCode?: string;
}

@Controller('checkout')
export class CheckoutController {
  constructor(private readonly checkout: MoyasarCheckoutService) {}

  @Public()
  @Get('availability')
  availability(@Query('packageCode') packageCode?: string) {
    return this.checkout.availability(packageCode);
  }

  @Post('session')
  async createSession(
    @CurrentUser() user: AuthUser,
    @Body() body: CreateSessionBody,
  ) {
    if (!user?.userId) {
      throw new ServiceUnavailableException({
        error: 'checkout_unavailable',
        message: CHECKOUT_UNAVAILABLE_AR,
      });
    }
    return this.checkout.start(user.userId, body?.packageCode);
  }

  @Get('purchases/:id')
  status(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.checkout.refresh(user.userId, id);
  }
}
