import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import {
  ALLOW_PASSWORD_SETUP_KEY,
  IS_ADMIN_KEY,
  IS_OWNER_KEY,
  IS_PUBLIC_KEY,
  PASSWORD_SETUP_KEY,
  AuthUser,
  isStaffRole,
} from '../decorators/auth.decorators';
import { AuthService } from '../../modules/auth/auth.service';
import { tokenMatches } from '../security/token-match';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | string[] | undefined>;
      user?: AuthUser;
      path?: string;
      url?: string;
    }>();

    const adminOnly = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const ownerOnly = this.reflector.getAllAndOverride<boolean>(IS_OWNER_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // Admin API token short-circuit
    const adminToken = this.config.get<string>('app.adminApiToken') ?? '';
    const headerToken = this.bearerOrAdminToken(req.headers);
    if (adminOnly && !ownerOnly && tokenMatches(headerToken, adminToken)) {
      req.user = {
        userId: 'admin-token',
        email: 'admin-token@namat.local',
        role: 'admin',
        sessionId: 'admin-token',
      };
      return true;
    }

    if (isPublic && !adminOnly) {
      // Still attach user if Bearer present
      const bearer = this.bearer(req.headers);
      if (bearer) {
        try {
          req.user = await this.auth.validateAccessToken(bearer);
        } catch {
          /* public route */
        }
      }
      return true;
    }

    const bearer = this.bearer(req.headers) ?? this.sessionCookie(req.headers);
    if (!bearer) {
      throw new UnauthorizedException('Authentication required');
    }
    if (
      this.sessionCookie(req.headers) &&
      !this.bearer(req.headers) &&
      !this.hasCsrfHeader(req.headers) &&
      !isPublic
    ) {
      const method = (req as { method?: string }).method ?? 'GET';
      if (!['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) {
        throw new UnauthorizedException('Missing CSRF header');
      }
    }

    // ADMIN_API_TOKEN is staff-scoped. It never satisfies an owner route.
    if (tokenMatches(bearer, adminToken)) {
      req.user = {
        userId: 'admin-token',
        email: 'admin-token@namat.local',
        role: 'admin',
        sessionId: 'admin-token',
      };
    } else {
      req.user = await this.auth.validateAccessToken(bearer);
    }

    if (!req.user) {
      throw new UnauthorizedException('Authentication required');
    }
    const purpose = req.user.purpose ?? 'customer';
    const passwordSetupRoute = this.reflector.getAllAndOverride<boolean>(
      PASSWORD_SETUP_KEY,
      [context.getHandler(), context.getClass()],
    );
    const allowPasswordSetup = this.reflector.getAllAndOverride<boolean>(
      ALLOW_PASSWORD_SETUP_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (purpose === 'password_setup' && !passwordSetupRoute && !allowPasswordSetup) {
      throw new UnauthorizedException({
        error: 'PasswordSetupRequired',
        message: 'Set a password before continuing.',
      });
    }
    const breakGlass = req.user.sessionId === 'admin-token';
    if ((adminOnly || ownerOnly) && !breakGlass && purpose !== 'staff') {
      throw new UnauthorizedException(
        ownerOnly ? 'Owner access required' : 'Admin access required',
      );
    }
    if (ownerOnly && req.user.role !== 'owner') {
      throw new UnauthorizedException('Owner access required');
    }
    if (adminOnly && !isStaffRole(req.user.role)) {
      throw new UnauthorizedException('Admin access required');
    }
    return true;
  }

  private sessionCookie(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    const raw = headers['cookie'] ?? headers['Cookie'];
    const v = Array.isArray(raw) ? raw.join(';') : raw;
    if (!v) return null;
    for (const part of v.split(';')) {
      const [k, ...rest] = part.trim().split('=');
      if (k === 'namat_session') return decodeURIComponent(rest.join('='));
    }
    return null;
  }

  private hasCsrfHeader(
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    const raw = headers['x-namat-request'] ?? headers['X-Namat-Request'];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return v === '1';
  }

  private bearer(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    const raw = headers['authorization'] ?? headers['Authorization'];
    const v = Array.isArray(raw) ? raw[0] : raw;
    if (!v?.startsWith('Bearer ')) return null;
    return v.slice(7).trim();
  }

  private bearerOrAdminToken(
    headers: Record<string, string | string[] | undefined>,
  ): string | null {
    const x = headers['x-admin-token'];
    if (typeof x === 'string' && x) return x;
    return this.bearer(headers);
  }
}
