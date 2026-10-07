import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const IS_ADMIN_KEY = 'isAdmin';
export const AdminOnly = () => SetMetadata(IS_ADMIN_KEY, true);

export const IS_OWNER_KEY = 'isOwner';
export const OwnerOnly = () => SetMetadata(IS_OWNER_KEY, true);

export const PASSWORD_SETUP_KEY = 'passwordSetup';
export const PasswordSetupOnly = () => SetMetadata(PASSWORD_SETUP_KEY, true);

export const ALLOW_PASSWORD_SETUP_KEY = 'allowPasswordSetup';
export const AllowPasswordSetup = () => SetMetadata(ALLOW_PASSWORD_SETUP_KEY, true);

export type SessionPurpose = 'customer' | 'staff' | 'password_setup';

export interface AuthUser {
  userId: string;
  email: string;
  role: 'user' | 'admin' | 'owner';
  sessionId: string;
  purpose?: SessionPurpose;
}

export function isStaffRole(role: string | undefined): boolean {
  return role === 'admin' || role === 'owner';
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const req = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    return req.user;
  },
);
