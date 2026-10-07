import { Controller, Get } from '@nestjs/common';
import { CurrentUser, AuthUser } from '../../common/decorators/auth.decorators';
import { UsersService } from '../users/users.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

@Controller()
export class MeController {
  constructor(
    private readonly users: UsersService,
    private readonly entitlements: EntitlementsService,
  ) {}

  @Get('me')
  async me(@CurrentUser() user: AuthUser) {
    const profile = await this.users.requireById(user.userId);
    const { entitlement, activeDevices } = await this.entitlements.getForUser(
      user.userId,
    );
    return {
      id: profile.id,
      email: profile.email,
      role: profile.role,
      sessionPurpose: user.purpose ?? 'customer',
      entitlement: entitlement
        ? {
            id: entitlement.id,
            status: entitlement.status,
            plan: entitlement.plan,
            maxDevices: entitlement.maxDevices,
            activeDevices,
          }
        : null,
    };
  }
}
