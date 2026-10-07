import { Controller, Get } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/auth.decorators';
import { EntitlementsService } from './entitlements.service';

@Controller('entitlements')
export class EntitlementsController {
  constructor(private readonly entitlements: EntitlementsService) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const { entitlement, activeDevices } = await this.entitlements.getForUser(
      user.userId,
    );
    if (!entitlement) {
      return { entitlement: null, activeDevices: 0 };
    }
    return {
      entitlement: {
        id: entitlement.id,
        status: entitlement.status,
        plan: entitlement.plan,
        maxDevices: entitlement.maxDevices,
        purchaseId: entitlement.purchaseId,
        createdAt: entitlement.createdAt,
      },
      activeDevices,
    };
  }
}
