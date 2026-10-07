import { TelegramUpdateService } from './telegram.update';
import { TG_CALLBACK } from './telegram.constants';

function makeService(opts: { linked: boolean }) {
  const sent: Array<{ chatId: unknown; text: string }> = [];
  const client = {
    enabled: true,
    sendMessage: jest.fn(async (chatId: unknown, text: string) => {
      sent.push({ chatId, text });
      return true;
    }),
    answerCallbackQuery: jest.fn(async () => true),
  };
  const account = opts.linked ? { userId: 'u1', telegramUserId: '42' } : null;
  const linking = {
    accountForTelegram: jest.fn(async () => account),
    touchLastSeen: jest.fn(async () => undefined),
    statusForUser: jest.fn(async () => ({ linked: opts.linked, linkedAt: new Date('2026-01-01'), telegramUsername: 'x' })),
    redeem: jest.fn(),
    unlinkByTelegram: jest.fn(async () => ({ ok: true })),
  };
  const entitlements = {
    getForUser: jest.fn(async () => ({ entitlement: { status: 'active', maxDevices: 2 }, activeDevices: 1 })),
  };
  const devices = {
    listForUser: jest.fn(async () => [
      { label: 'iPhone', status: 'active', iosVersion: '17.0' },
    ]),
  };
  const purchases = { getForUser: jest.fn(async () => []) };
  const skins = { listPublishedManifest: jest.fn(async () => [{ name: 'Aurora' }]) };
  const support = { createFromCustomer: jest.fn(async () => ({})) };
  const users = { findById: jest.fn(async () => ({ email: 'u1@namat.test' })) };
  const config = { get: (k: string) => (k === 'app.telegram.webBase' ? 'https://namat.shara.sa' : undefined) };

  const service = new TelegramUpdateService(
    client as never,
    linking as never,
    entitlements as never,
    devices as never,
    purchases as never,
    skins as never,
    support as never,
    users as never,
    config as never,
  );
  return { service, client, linking, entitlements, support, sent };
}

function message(text: string, fromId = 42) {
  return { update_id: 1, message: { message_id: 1, chat: { id: 100 }, from: { id: fromId }, text } };
}

describe('TelegramUpdateService', () => {
  it('prompts an unlinked user to link and does not read account data', async () => {
    const { service, entitlements, sent } = makeService({ linked: false });
    await service.handleUpdate(message('/account') as never);
    expect(entitlements.getForUser).not.toHaveBeenCalled();
    expect(sent.some((m) => m.text.includes('اربط حساب نَمَط'))).toBe(true);
  });

  it('shows account status for a linked user', async () => {
    const { service, entitlements, sent } = makeService({ linked: true });
    await service.handleUpdate(message('/account') as never);
    expect(entitlements.getForUser).toHaveBeenCalledWith('u1');
    expect(sent.some((m) => m.text.includes('مفعّل'))).toBe(true);
    expect(sent.some((m) => m.text.includes('1 من 2'))).toBe(true);
  });

  it('lists devices for a linked user', async () => {
    const { service, sent } = makeService({ linked: true });
    await service.handleUpdate(message('/devices') as never);
    expect(sent.some((m) => m.text.includes('أجهزتك'))).toBe(true);
    expect(sent.some((m) => m.text.includes('iPhone'))).toBe(true);
  });

  it('answers /help with the command list', async () => {
    const { service, sent } = makeService({ linked: true });
    await service.handleUpdate(message('/help') as never);
    expect(sent.some((m) => m.text.includes('/account'))).toBe(true);
  });

  it('runs the support flow: category then free text creates a note', async () => {
    const { service, support, sent } = makeService({ linked: true });
    await service.handleUpdate({
      update_id: 2,
      callback_query: { id: 'cb1', from: { id: 42 }, data: TG_CALLBACK.supportApp, message: { message_id: 1, chat: { id: 100 } } },
    } as never);
    expect(sent.some((m) => m.text.includes('اكتب رسالتك'))).toBe(true);
    await service.handleUpdate(message('التطبيق لا يفتح') as never);
    expect(support.createFromCustomer).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1', subject: expect.stringContaining('التطبيق'), body: 'التطبيق لا يفتح' }),
    );
    expect(sent.some((m) => m.text.includes('تم إرسال طلبك'))).toBe(true);
  });

  it('rate limits a flood of messages', async () => {
    const { service, sent } = makeService({ linked: true });
    for (let i = 0; i < 25; i += 1) {
      await service.handleUpdate(message('/help') as never);
    }
    expect(sent.some((m) => m.text.includes('عدد كبير من الطلبات'))).toBe(true);
  });

  it('unlinks via the inline button', async () => {
    const { service, linking, sent } = makeService({ linked: true });
    await service.handleUpdate({
      update_id: 3,
      callback_query: { id: 'cb2', from: { id: 42 }, data: TG_CALLBACK.unlink, message: { message_id: 1, chat: { id: 100 } } },
    } as never);
    expect(linking.unlinkByTelegram).toHaveBeenCalledWith('42');
    expect(sent.some((m) => m.text.includes('إلغاء ربط'))).toBe(true);
  });
});
