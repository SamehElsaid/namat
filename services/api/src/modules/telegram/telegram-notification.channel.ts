import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TelegramAccountEntity } from '../../database/entities';
import { NotificationsService } from '../notifications/notifications.service';
import {
  NotificationChannel,
  NotificationEvent,
  NotificationType,
} from '../notifications/notification-events';
import { TelegramClient } from './telegram.client';

const MESSAGES: Record<NotificationType, (data?: NotificationEvent['data']) => string> = {
  ACCOUNT_LINKED: () => 'تم ربط حسابك في نَمَط بـ تيليجرام ✅',
  NEW_DEVICE: (d) =>
    `🔐 تم تفعيل جهاز جديد على حسابك${d?.label ? `: ${d.label}` : ''}. إذا لم تكن أنت، تواصل مع الدعم فورًا.`,
  DEVICE_REMOVED: (d) => `تمت إزالة جهاز من حسابك${d?.label ? `: ${d.label}` : ''}.`,
  PURCHASE_COMPLETED: () => 'تم تأكيد عملية الشراء وتفعيل نَمَط على حسابك ✅',
  NEW_DESIGN_AVAILABLE: (d) =>
    `🎨 تصميم جديد متاح${d?.name ? `: ${d.name}` : ''}. افتح نَمَط لتطبيقه.`,
  SECURITY_ALERT: (d) =>
    `⚠️ تنبيه أمني على حسابك${d?.detail ? `: ${d.detail}` : ''}. إذا لم تكن أنت، غيّر وصولك وتواصل مع الدعم.`,
  SUPPORT_UPDATE: () => 'وصلك رد جديد من فريق الدعم. افتح حسابك في نَمَط لقراءته.',
};

/**
 * Delivers notification events to a linked Telegram chat. Registers itself with
 * the dispatcher at startup so no domain module imports Telegram directly.
 */
@Injectable()
export class TelegramNotificationChannel implements NotificationChannel, OnModuleInit {
  readonly name = 'telegram';

  constructor(
    private readonly client: TelegramClient,
    private readonly notifications: NotificationsService,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
  ) {}

  onModuleInit(): void {
    this.notifications.register(this);
  }

  async deliver(event: NotificationEvent): Promise<void> {
    if (!this.client.enabled) return;
    const account = await this.accounts.findOne({
      where: { userId: event.userId, isActive: true },
    });
    const chatId = account?.telegramChatId ?? account?.telegramUserId;
    if (!account || !chatId) return;
    const render = MESSAGES[event.type];
    if (!render) return;
    await this.client.sendMessage(chatId, render(event.data));
  }
}
