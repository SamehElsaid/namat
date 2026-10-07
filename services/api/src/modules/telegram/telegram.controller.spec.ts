import { UnauthorizedException } from '@nestjs/common';
import { TelegramController } from './telegram.controller';

function make(opts: { enabled: boolean; secret: string }) {
  const client = { enabled: opts.enabled };
  const updates = { handleUpdate: jest.fn(async () => undefined) };
  const linking = {
    issueToken: jest.fn(async () => ({ deepLink: 'https://t.me/NamatBot?start=tok', expiresInSeconds: 600 })),
    unlinkByUser: jest.fn(async () => ({ ok: true })),
    statusForUser: jest.fn(async () => ({ linked: true, linkedAt: null, telegramUsername: 'x' })),
  };
  const config = {
    get: (k: string) =>
      k === 'app.telegram.webhookSecret' ? opts.secret : k === 'app.telegram.botUsername' ? 'NamatBot' : undefined,
  };
  const controller = new TelegramController(client as never, linking as never, updates as never, config as never);
  return { controller, updates, linking };
}

const user = { userId: 'u1', email: 'u1@namat.test' } as never;
const update = { update_id: 1, message: { message_id: 1, chat: { id: 1 }, text: '/help' } } as never;

describe('TelegramController webhook', () => {
  it('ignores updates when the integration is disabled', async () => {
    const { controller, updates } = make({ enabled: false, secret: 'sekret-value-1234' });
    await expect(controller.webhook('anything', update)).resolves.toEqual({ ok: true });
    expect(updates.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects a missing or wrong secret token (fails closed)', async () => {
    const { controller, updates } = make({ enabled: true, secret: 'sekret-value-1234' });
    await expect(controller.webhook(undefined, update)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(controller.webhook('wrong', update)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(updates.handleUpdate).not.toHaveBeenCalled();
  });

  it('rejects when enabled but no secret is configured', async () => {
    const { controller } = make({ enabled: true, secret: '' });
    await expect(controller.webhook('', update)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('processes an update when the secret matches', async () => {
    const { controller, updates } = make({ enabled: true, secret: 'sekret-value-1234' });
    await expect(controller.webhook('sekret-value-1234', update)).resolves.toEqual({ ok: true });
    expect(updates.handleUpdate).toHaveBeenCalledTimes(1);
  });

  it('mints a link token for an authenticated user', async () => {
    const { controller, linking } = make({ enabled: true, secret: 's' });
    const res = await controller.linkToken(user);
    expect(linking.issueToken).toHaveBeenCalledWith('u1', 'u1@namat.test');
    expect(res.deepLink).toContain('t.me/NamatBot');
    expect(res.botUsername).toBe('NamatBot');
  });

  it('unlinks an authenticated user', async () => {
    const { controller, linking } = make({ enabled: true, secret: 's' });
    await controller.unlink(user);
    expect(linking.unlinkByUser).toHaveBeenCalledWith('u1', 'u1@namat.test');
  });
});
