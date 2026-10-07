import { TelegramNotificationChannel } from './telegram-notification.channel';
import { NotificationsService } from '../notifications/notifications.service';

function make(opts: { enabled: boolean; account: unknown }) {
  const client = { enabled: opts.enabled, sendMessage: jest.fn(async () => true) };
  const accounts = { findOne: jest.fn(async () => opts.account) };
  const notifications = new NotificationsService();
  const channel = new TelegramNotificationChannel(client as never, notifications, accounts as never);
  return { channel, client, notifications };
}

describe('TelegramNotificationChannel', () => {
  it('registers itself with the dispatcher on init', () => {
    const { channel, notifications, client } = make({ enabled: true, account: { telegramChatId: '55', userId: 'u1' } });
    const register = jest.spyOn(notifications, 'register');
    channel.onModuleInit();
    expect(register).toHaveBeenCalledWith(channel);
    // And emitting through the dispatcher reaches the channel.
    notifications.emit({ type: 'PURCHASE_COMPLETED', userId: 'u1' });
    // allow the fire-and-forget microtask to run
    return Promise.resolve().then(() => {
      expect(client.sendMessage).toHaveBeenCalled();
    });
  });

  it('does nothing when telegram is disabled', async () => {
    const { channel, client } = make({ enabled: false, account: { telegramChatId: '55', userId: 'u1' } });
    await channel.deliver({ type: 'NEW_DEVICE', userId: 'u1' });
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('does nothing when the user has no linked account', async () => {
    const { channel, client } = make({ enabled: true, account: null });
    await channel.deliver({ type: 'NEW_DEVICE', userId: 'u1' });
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it('delivers to the linked chat with an Arabic security message', async () => {
    const { channel, client } = make({ enabled: true, account: { telegramChatId: '55', userId: 'u1' } });
    await channel.deliver({ type: 'NEW_DEVICE', userId: 'u1', data: { label: 'iPhone 15' } });
    expect(client.sendMessage).toHaveBeenCalledWith('55', expect.stringContaining('جهاز جديد'));
  });
});
