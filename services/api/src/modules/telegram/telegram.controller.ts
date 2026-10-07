import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { AuthUser, CurrentUser, Public } from '../../common/decorators/auth.decorators';
import { tokenMatches } from '../../common/security/token-match';
import { StructuredLogger } from '../../common/logging/logger';
import { TelegramClient } from './telegram.client';
import { TelegramLinkingService } from './telegram-linking.service';
import { TelegramUpdateService } from './telegram.update';
import { TelegramUpdate } from './telegram.types';

const SECRET_HEADER = 'x-telegram-bot-api-secret-token';

@Controller('integrations/telegram')
export class TelegramController {
  private readonly log = new StructuredLogger('TelegramWebhook');

  constructor(
    private readonly client: TelegramClient,
    private readonly linking: TelegramLinkingService,
    private readonly updates: TelegramUpdateService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Telegram delivers updates here. Public (Telegram is unauthenticated) but
   * guarded by the secret token Telegram echoes in a header. Always 200 so
   * Telegram does not retry on our processing errors.
   */
  @Public()
  @SkipThrottle()
  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Headers(SECRET_HEADER) secret: string | undefined,
    @Body() update: TelegramUpdate,
  ): Promise<{ ok: true }> {
    if (!this.client.enabled) return { ok: true };
    const expected = this.config.get<string>('app.telegram.webhookSecret') ?? '';
    // Fail closed: with no configured secret we cannot authenticate Telegram.
    if (!expected || !tokenMatches(secret ?? null, expected)) {
      this.log.warn('rejected telegram webhook with bad secret');
      throw new UnauthorizedException();
    }
    await this.updates.handleUpdate(update);
    return { ok: true };
  }

  /** Authenticated NAMAT customer mints a single-use deep-link token. */
  @Post('link-token')
  async linkToken(@CurrentUser() user: AuthUser) {
    if (!user?.userId) throw new UnauthorizedException();
    const { deepLink, expiresInSeconds } = await this.linking.issueToken(
      user.userId,
      user.email ?? null,
    );
    const username = this.config.get<string>('app.telegram.botUsername') ?? '';
    return { deepLink, botUsername: username || null, expiresInSeconds };
  }

  @Post('unlink')
  async unlink(@CurrentUser() user: AuthUser) {
    if (!user?.userId) throw new UnauthorizedException();
    return this.linking.unlinkByUser(user.userId, user.email ?? null);
  }

  @Get('link-status')
  async status(@CurrentUser() user: AuthUser) {
    if (!user?.userId) throw new UnauthorizedException();
    return this.linking.statusForUser(user.userId);
  }
}
