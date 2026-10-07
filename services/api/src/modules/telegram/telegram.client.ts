import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../../common/logging/logger';
import { SendMessageOptions } from './telegram.types';

/**
 * Thin Telegram Bot API client. When no bot token is configured the client is
 * disabled: every outbound call is a no-op, so the rest of the system runs
 * normally in development and CI. The token is only ever used to build the
 * request URL and is never logged.
 */
@Injectable()
export class TelegramClient {
  private readonly log = new StructuredLogger('TelegramClient');

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.token.length > 0;
  }

  private get token(): string {
    return this.config.get<string>('app.telegram.botToken') ?? '';
  }

  private get apiBase(): string {
    return this.config.get<string>('app.telegram.apiBase') ?? 'https://api.telegram.org';
  }

  async sendMessage(
    chatId: string | number,
    text: string,
    options: SendMessageOptions = {},
  ): Promise<boolean> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      disable_web_page_preview: options.disableWebPagePreview ?? true,
      ...(options.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
    });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<boolean> {
    return this.call('answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      ...(text ? { text } : {}),
    });
  }

  /** Register the webhook with Telegram. Used by the setup script/docs, not at boot. */
  async setWebhook(url: string, secretToken: string): Promise<boolean> {
    return this.call('setWebhook', {
      url,
      secret_token: secretToken,
      allowed_updates: ['message', 'callback_query'],
    });
  }

  private async call(method: string, body: Record<string, unknown>): Promise<boolean> {
    if (!this.enabled) {
      this.log.debug('telegram disabled; skipping call', { method });
      return false;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Never include the URL (it carries the token) in the log.
        this.log.warn('telegram api non-2xx', { method, status: res.status });
        return false;
      }
      return true;
    } catch (err) {
      this.log.warn('telegram api call failed', {
        method,
        error: err instanceof Error ? err.message : 'unknown',
      });
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }
}
