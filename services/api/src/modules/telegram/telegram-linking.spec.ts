import { DataSource } from 'typeorm';
import { ALL_ENTITIES } from '../../database/entities';
import {
  TelegramAccountEntity,
  TelegramLinkTokenEntity,
} from '../../database/entities';
import { UserEntity } from '../../database/entities/user.entity';
import { TelegramLinkingService } from './telegram-linking.service';

const profile = (id: string) => ({
  telegramUserId: id,
  telegramChatId: id,
  telegramUsername: `u${id}`,
  telegramFirstName: 'T',
  telegramLanguageCode: 'ar',
});

describe('TelegramLinkingService', () => {
  let db: DataSource;
  let service: TelegramLinkingService;
  const audit = { record: jest.fn() };
  const config = { get: (k: string) => (k === 'app.telegram.botUsername' ? 'NamatBot' : undefined) };

  beforeAll(async () => {
    db = new DataSource({ type: 'better-sqlite3', database: ':memory:', entities: ALL_ENTITIES, synchronize: true });
    await db.initialize();
    service = new TelegramLinkingService(
      db,
      db.getRepository(TelegramAccountEntity),
      db.getRepository(TelegramLinkTokenEntity),
      audit as never,
      config as never,
    );
  });

  afterAll(async () => {
    if (db?.isInitialized) await db.destroy();
  });

  async function user(email: string): Promise<string> {
    const u = await db.getRepository(UserEntity).save(
      db.getRepository(UserEntity).create({ email, role: 'user', isActive: true }),
    );
    return u.id;
  }

  it('issues a single-use token and a deep link, storing only its hash', async () => {
    const userId = await user('a@namat.test');
    const { token, deepLink, expiresInSeconds } = await service.issueToken(userId, 'a@namat.test');
    expect(token).toHaveLength(43); // 32 bytes base64url
    expect(deepLink).toBe(`https://t.me/NamatBot?start=${token}`);
    expect(expiresInSeconds).toBeGreaterThan(0);
    const stored = await db.getRepository(TelegramLinkTokenEntity).findOne({ where: { userId } });
    expect(stored!.tokenHash).not.toBe(token);
  });

  it('links on redeem, then reports already-linked on reuse of a fresh token', async () => {
    const userId = await user('b@namat.test');
    const { token } = await service.issueToken(userId, 'b@namat.test');
    const first = await service.redeem(token, profile('555'));
    expect(first).toEqual({ status: 'linked', userId });
    // Same token is single-use: a second redeem is invalid.
    const replay = await service.redeem(token, profile('555'));
    expect(replay.status).toBe('invalid');
    // A new token for the same pair is idempotent (already linked).
    const { token: token2 } = await service.issueToken(userId, 'b@namat.test');
    const again = await service.redeem(token2, profile('555'));
    expect(again.status).toBe('already');
  });

  it('rejects an expired token', async () => {
    const userId = await user('c@namat.test');
    const { token } = await service.issueToken(userId, 'c@namat.test');
    const hash = await db.getRepository(TelegramLinkTokenEntity).findOne({ where: { userId } });
    hash!.expiresAt = new Date(Date.now() - 1000);
    await db.getRepository(TelegramLinkTokenEntity).save(hash!);
    const res = await service.redeem(token, profile('777'));
    expect(res.status).toBe('invalid');
  });

  it('refuses to link a telegram id already active on another account', async () => {
    const userA = await user('d@namat.test');
    const userB = await user('e@namat.test');
    const t1 = (await service.issueToken(userA, 'd@namat.test')).token;
    expect((await service.redeem(t1, profile('900'))).status).toBe('linked');
    const t2 = (await service.issueToken(userB, 'e@namat.test')).token;
    const res = await service.redeem(t2, profile('900'));
    expect(res.status).toBe('taken_by_other');
  });

  it('unlinks and allows re-linking', async () => {
    const userId = await user('f@namat.test');
    const t1 = (await service.issueToken(userId, 'f@namat.test')).token;
    await service.redeem(t1, profile('1200'));
    expect((await service.statusForUser(userId)).linked).toBe(true);
    expect((await service.unlinkByUser(userId, 'f@namat.test')).ok).toBe(true);
    expect((await service.statusForUser(userId)).linked).toBe(false);
    // Telegram id is now free to link again.
    const t2 = (await service.issueToken(userId, 'f@namat.test')).token;
    expect((await service.redeem(t2, profile('1200'))).status).toBe('linked');
  });
});
