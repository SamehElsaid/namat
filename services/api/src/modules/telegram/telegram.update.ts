import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../../common/logging/logger';
import { DevicesService } from '../devices/devices.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { PurchasesService } from '../purchases/purchases.service';
import { presentCustomerPurchase } from '../purchases/customer-purchase';
import { SkinsService } from '../skins/skins.service';
import { SupportService } from '../support/support.service';
import { UsersService } from '../users/users.service';
import { TelegramClient } from './telegram.client';
import { TelegramLinkingService } from './telegram-linking.service';
import { TG_BUTTONS, TG_CALLBACK, TG_TEXT } from './telegram.constants';
import {
  InlineKeyboardButton,
  TelegramMessage,
  TelegramUpdate,
  TelegramUser,
} from './telegram.types';

const RATE_LIMIT = 20; // actions
const RATE_WINDOW_MS = 60_000;
const SUPPORT_STATE_TTL_MS = 10 * 60 * 1000;

const SUPPORT_SUBJECTS: Record<string, string> = {
  [TG_CALLBACK.supportApp]: 'التطبيق',
  [TG_CALLBACK.supportPayment]: 'الدفع',
  [TG_CALLBACK.supportDevice]: 'الجهاز',
  [TG_CALLBACK.supportDesign]: 'التصميم',
  [TG_CALLBACK.supportOther]: 'أخرى',
};

@Injectable()
export class TelegramUpdateService {
  private readonly log = new StructuredLogger('TelegramUpdate');
  private readonly hits = new Map<string, number[]>();
  private readonly pendingSupport = new Map<string, { subject: string; at: number }>();

  constructor(
    private readonly client: TelegramClient,
    private readonly linking: TelegramLinkingService,
    private readonly entitlements: EntitlementsService,
    private readonly devices: DevicesService,
    private readonly purchases: PurchasesService,
    private readonly skins: SkinsService,
    private readonly support: SupportService,
    private readonly users: UsersService,
    private readonly config: ConfigService,
  ) {}

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    try {
      if (update.callback_query) {
        await this.onCallback(update.callback_query.id, update.callback_query.from, update.callback_query.data ?? '', update.callback_query.message?.chat.id);
        return;
      }
      if (update.message) {
        await this.onMessage(update.message);
      }
    } catch (err) {
      this.log.warn('update handling failed', {
        error: err instanceof Error ? err.message : 'unknown',
      });
    }
  }

  private webBase(): string {
    return this.config.get<string>('app.telegram.webBase') ?? 'https://namat.shara.sa';
  }

  private rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
    recent.push(now);
    this.hits.set(key, recent);
    return recent.length > RATE_LIMIT;
  }

  private async onMessage(message: TelegramMessage): Promise<void> {
    const from = message.from;
    const chatId = message.chat.id;
    if (!from) return;
    const tgId = String(from.id);
    if (this.rateLimited(`msg:${tgId}`)) {
      await this.client.sendMessage(chatId, TG_TEXT.rateLimited);
      return;
    }
    const text = (message.text ?? '').trim();

    if (text.startsWith('/start')) {
      const token = text.split(/\s+/)[1];
      if (token) {
        await this.handleStartLink(chatId, from, token);
      } else {
        await this.showMenu(chatId, tgId);
      }
      return;
    }

    const command = text.startsWith('/') ? text.slice(1).split(/[@\s]/)[0] : null;
    if (command) {
      await this.handleCommand(command, chatId, tgId);
      return;
    }

    // Free text: if a support draft is pending for this user, submit it.
    const pending = this.pendingSupport.get(tgId);
    if (pending && Date.now() - pending.at < SUPPORT_STATE_TTL_MS) {
      this.pendingSupport.delete(tgId);
      await this.submitSupport(chatId, tgId, pending.subject, text);
      return;
    }
    await this.showMenu(chatId, tgId);
  }

  private async onCallback(
    callbackId: string,
    from: TelegramUser,
    data: string,
    chatIdFromMessage?: number,
  ): Promise<void> {
    const tgId = String(from.id);
    const chatId = chatIdFromMessage ?? from.id;
    await this.client.answerCallbackQuery(callbackId);
    if (this.rateLimited(`cb:${tgId}`)) {
      await this.client.sendMessage(chatId, TG_TEXT.rateLimited);
      return;
    }
    if (data === TG_CALLBACK.unlink) {
      const res = await this.linking.unlinkByTelegram(tgId);
      await this.client.sendMessage(chatId, res.ok ? TG_TEXT.unlinked : TG_TEXT.notLinked);
      return;
    }
    if (SUPPORT_SUBJECTS[data]) {
      this.pendingSupport.set(tgId, { subject: SUPPORT_SUBJECTS[data], at: Date.now() });
      await this.client.sendMessage(chatId, TG_TEXT.supportAsk);
      return;
    }
    await this.handleCommand(data, chatId, tgId);
  }

  private async handleCommand(command: string, chatId: number, tgId: string): Promise<void> {
    switch (command) {
      case 'start':
        return this.showMenu(chatId, tgId);
      case 'help':
        await this.client.sendMessage(chatId, TG_TEXT.help);
        return;
      case 'account':
        return this.cmdAccount(chatId, tgId);
      case 'devices':
        return this.cmdDevices(chatId, tgId);
      case 'designs':
        return this.cmdDesigns(chatId, tgId);
      case 'orders':
        return this.cmdOrders(chatId, tgId);
      case 'support':
        return this.cmdSupport(chatId, tgId);
      default:
        await this.client.sendMessage(chatId, TG_TEXT.help);
    }
  }

  private async requireLinkedUserId(chatId: number, tgId: string): Promise<string | null> {
    const account = await this.linking.accountForTelegram(tgId);
    if (!account) {
      await this.client.sendMessage(chatId, TG_TEXT.needLink, {
        replyMarkup: { inline_keyboard: [[this.openButton()]] },
      });
      return null;
    }
    await this.linking.touchLastSeen(tgId);
    return account.userId;
  }

  private openButton(path = '/account'): InlineKeyboardButton {
    return { text: TG_BUTTONS.openNamat, url: `${this.webBase()}${path}` };
  }

  private async showMenu(chatId: number, tgId: string): Promise<void> {
    const account = await this.linking.accountForTelegram(tgId);
    if (!account) {
      await this.client.sendMessage(chatId, `${TG_TEXT.welcome}\n\n${TG_TEXT.needLink}`, {
        replyMarkup: { inline_keyboard: [[this.openButton()]] },
      });
      return;
    }
    await this.linking.touchLastSeen(tgId);
    await this.client.sendMessage(chatId, TG_TEXT.welcome, {
      replyMarkup: {
        inline_keyboard: [
          [this.openButton('/')],
          [
            { text: TG_BUTTONS.account, callback_data: TG_CALLBACK.account },
            { text: TG_BUTTONS.devices, callback_data: TG_CALLBACK.devices },
          ],
          [
            { text: TG_BUTTONS.designs, callback_data: TG_CALLBACK.designs },
            { text: TG_BUTTONS.orders, callback_data: TG_CALLBACK.orders },
          ],
          [{ text: TG_BUTTONS.support, callback_data: TG_CALLBACK.support }],
        ],
      },
    });
  }

  private async handleStartLink(chatId: number, from: TelegramUser, token: string): Promise<void> {
    const result = await this.linking.redeem(token, {
      telegramUserId: String(from.id),
      telegramChatId: String(chatId),
      telegramUsername: from.username ?? null,
      telegramFirstName: from.first_name ?? null,
      telegramLanguageCode: from.language_code ?? null,
    });
    if (result.status === 'linked') {
      await this.client.sendMessage(chatId, TG_TEXT.linked);
      await this.showMenu(chatId, String(from.id));
    } else if (result.status === 'already') {
      await this.client.sendMessage(chatId, TG_TEXT.alreadyLinked);
    } else if (result.status === 'taken_by_other') {
      await this.client.sendMessage(chatId, TG_TEXT.linkTakenByOther);
    } else {
      await this.client.sendMessage(chatId, TG_TEXT.linkInvalid);
    }
  }

  private async cmdAccount(chatId: number, tgId: string): Promise<void> {
    const userId = await this.requireLinkedUserId(chatId, tgId);
    if (!userId) return;
    const { entitlement, activeDevices } = await this.entitlements.getForUser(userId);
    const status = entitlement?.status === 'active' ? 'مفعّل ✅' : 'غير مفعّل';
    const plan = entitlement?.status === 'active' ? '\nالاشتراك: مفعّل' : '';
    const max = entitlement?.maxDevices ?? 1;
    const link = await this.linking.statusForUser(userId);
    const linkedAt = link.linkedAt ? `\nمربوط منذ: ${link.linkedAt.toISOString().slice(0, 10)}` : '';
    await this.client.sendMessage(
      chatId,
      `حسابك\nالحالة: ${status}${plan}\nالأجهزة المستخدمة: ${activeDevices} من ${max}${linkedAt}`,
      { replyMarkup: { inline_keyboard: [[this.openButton('/account')], [{ text: TG_BUTTONS.unlink, callback_data: TG_CALLBACK.unlink }]] } },
    );
  }

  private async cmdDevices(chatId: number, tgId: string): Promise<void> {
    const userId = await this.requireLinkedUserId(chatId, tgId);
    if (!userId) return;
    const devices = await this.devices.listForUser(userId);
    const active = devices.filter((d) => d.status === 'active');
    const { entitlement } = await this.entitlements.getForUser(userId);
    const max = entitlement?.maxDevices ?? 1;
    if (devices.length === 0) {
      await this.client.sendMessage(chatId, 'لا توجد أجهزة مرتبطة بحسابك بعد.', {
        replyMarkup: { inline_keyboard: [[this.openButton('/devices')]] },
      });
      return;
    }
    const lines = devices
      .slice(0, 10)
      .map((d) => {
        const label = d.label || d.iosVersion || 'iPhone';
        const state = d.status === 'active' ? 'نشط' : 'غير نشط';
        return `• ${label} — ${state}`;
      })
      .join('\n');
    await this.client.sendMessage(
      chatId,
      `أجهزتك\n${lines}\n\n${active.length} من ${max} جهاز مستخدم`,
      { replyMarkup: { inline_keyboard: [[this.openButton('/devices')]] } },
    );
  }

  private async cmdDesigns(chatId: number, tgId: string): Promise<void> {
    const userId = await this.requireLinkedUserId(chatId, tgId);
    if (!userId) return;
    const skins = await this.skins.listPublishedManifest();
    if (skins.length === 0) {
      await this.client.sendMessage(chatId, 'لا توجد تصاميم متاحة حاليًا.', {
        replyMarkup: { inline_keyboard: [[this.openButton('/designs')]] },
      });
      return;
    }
    const lines = skins.slice(0, 15).map((s) => `• ${s.name}`).join('\n');
    await this.client.sendMessage(
      chatId,
      `التصاميم المتاحة\n${lines}\n\nيتم التطبيق داخل تطبيق نَمَط.`,
      { replyMarkup: { inline_keyboard: [[{ text: 'فتح في نَمَط', url: `${this.webBase()}/designs` }]] } },
    );
  }

  private async cmdOrders(chatId: number, tgId: string): Promise<void> {
    const userId = await this.requireLinkedUserId(chatId, tgId);
    if (!userId) return;
    const rows = (await this.purchases.getForUser(userId)).map(presentCustomerPurchase);
    if (rows.length === 0) {
      await this.client.sendMessage(chatId, 'لا توجد مشتريات على حسابك بعد.', {
        replyMarkup: { inline_keyboard: [[this.openButton('/account')]] },
      });
      return;
    }
    const lines = rows
      .slice(0, 10)
      .map((p) => {
        const amount = (p.amountMinor / 100).toFixed(2);
        const date = p.createdAt.slice(0, 10);
        return `• ${date} — ${amount} ${p.currency} — ${this.orderStatusAr(p.status)}`;
      })
      .join('\n');
    await this.client.sendMessage(chatId, `مشترياتك\n${lines}`, {
      replyMarkup: { inline_keyboard: [[this.openButton('/account')]] },
    });
  }

  private orderStatusAr(status: string): string {
    switch (status) {
      case 'completed':
        return 'مكتمل';
      case 'pending':
        return 'قيد المعالجة';
      case 'failed':
        return 'فشل';
      case 'refunded':
        return 'مسترجع';
      case 'cancelled':
        return 'ملغي';
      default:
        return status;
    }
  }

  private async cmdSupport(chatId: number, tgId: string): Promise<void> {
    const userId = await this.requireLinkedUserId(chatId, tgId);
    if (!userId) return;
    await this.client.sendMessage(chatId, TG_TEXT.supportPrompt, {
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'التطبيق', callback_data: TG_CALLBACK.supportApp },
            { text: 'الدفع', callback_data: TG_CALLBACK.supportPayment },
          ],
          [
            { text: 'الجهاز', callback_data: TG_CALLBACK.supportDevice },
            { text: 'التصميم', callback_data: TG_CALLBACK.supportDesign },
          ],
          [{ text: 'أخرى', callback_data: TG_CALLBACK.supportOther }],
        ],
      },
    });
  }

  private async submitSupport(
    chatId: number,
    tgId: string,
    subject: string,
    body: string,
  ): Promise<void> {
    const account = await this.linking.accountForTelegram(tgId);
    if (!account) {
      await this.client.sendMessage(chatId, TG_TEXT.needLink);
      return;
    }
    if (!body.trim()) {
      await this.client.sendMessage(chatId, TG_TEXT.supportEmpty);
      return;
    }
    const user = await this.users.findById(account.userId);
    await this.support.createFromCustomer({
      userId: account.userId,
      email: user?.email ?? null,
      subject: `تيليجرام — ${subject}`,
      body: body.slice(0, 4000),
    });
    await this.client.sendMessage(chatId, TG_TEXT.supportSent);
  }
}
