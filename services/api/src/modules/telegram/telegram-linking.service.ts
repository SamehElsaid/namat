import { createHash, randomBytes } from 'crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  TelegramAccountEntity,
  TelegramLinkTokenEntity,
} from '../../database/entities';
import { AuditService } from '../audit/audit.service';

const LINK_TOKEN_TTL_MS = 10 * 60 * 1000;

export interface TelegramProfile {
  telegramUserId: string;
  telegramChatId: string | null;
  telegramUsername: string | null;
  telegramFirstName: string | null;
  telegramLanguageCode: string | null;
}

export type RedeemResult =
  | { status: 'linked'; userId: string }
  | { status: 'already'; userId: string }
  | { status: 'taken_by_other' }
  | { status: 'invalid' };

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class TelegramLinkingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(TelegramAccountEntity)
    private readonly accounts: Repository<TelegramAccountEntity>,
    @InjectRepository(TelegramLinkTokenEntity)
    private readonly tokens: Repository<TelegramLinkTokenEntity>,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  /** Mint a single-use deep-link token for an authenticated NAMAT user. */
  async issueToken(
    userId: string,
    email: string | null,
  ): Promise<{ token: string; deepLink: string | null; expiresInSeconds: number }> {
    // Invalidate the user's earlier unused tokens so only the newest works.
    await this.tokens.delete({ userId, consumedAt: null } as never);
    const token = randomBytes(32).toString('base64url');
    await this.tokens.save(
      this.tokens.create({
        tokenHash: hashToken(token),
        userId,
        expiresAt: new Date(Date.now() + LINK_TOKEN_TTL_MS),
        consumedAt: null,
      }),
    );
    await this.audit.record({
      action: 'telegram.link_token_issued',
      actorUserId: userId,
      actorEmail: email,
      actorType: 'user',
      resourceType: 'telegram_account',
      resourceId: userId,
      result: 'success',
    });
    const username = this.config.get<string>('app.telegram.botUsername') ?? '';
    const deepLink = username ? `https://t.me/${username}?start=${token}` : null;
    return { token, deepLink, expiresInSeconds: Math.floor(LINK_TOKEN_TTL_MS / 1000) };
  }

  /** Redeem a token from a /start deep link and link the Telegram profile. */
  async redeem(token: string, profile: TelegramProfile): Promise<RedeemResult> {
    const tokenHash = hashToken(token.trim());
    return this.dataSource.transaction(async (manager) => {
      const tokenRepo = manager.getRepository(TelegramLinkTokenEntity);
      const accountRepo = manager.getRepository(TelegramAccountEntity);
      const row = await tokenRepo.findOne({ where: { tokenHash } });
      if (!row || row.consumedAt || row.expiresAt < new Date()) {
        return { status: 'invalid' } as RedeemResult;
      }
      row.consumedAt = new Date();
      await tokenRepo.save(row);

      // A Telegram id already active on a different account must not be stolen.
      const byTelegram = await accountRepo.findOne({
        where: { telegramUserId: profile.telegramUserId },
      });
      if (byTelegram && byTelegram.isActive && byTelegram.userId !== row.userId) {
        return { status: 'taken_by_other' } as RedeemResult;
      }

      const existingForUser = await accountRepo.findOne({ where: { userId: row.userId } });
      const now = new Date();

      // Reuse whichever row we can so the unique (userId)/(telegramUserId)
      // constraints always hold: take over the telegram row, else the user row.
      const target = byTelegram ?? existingForUser ?? accountRepo.create({});
      const wasAlready =
        Boolean(byTelegram) &&
        byTelegram!.isActive &&
        byTelegram!.userId === row.userId &&
        (!existingForUser || existingForUser.id === byTelegram!.id);

      // If the user had a different telegram row, retire it to keep one per user.
      if (existingForUser && byTelegram && existingForUser.id !== byTelegram.id) {
        await accountRepo.delete({ id: existingForUser.id } as never);
      }

      target.userId = row.userId;
      target.telegramUserId = profile.telegramUserId;
      target.telegramChatId = profile.telegramChatId;
      target.telegramUsername = profile.telegramUsername;
      target.telegramFirstName = profile.telegramFirstName;
      target.telegramLanguageCode = profile.telegramLanguageCode;
      target.isActive = true;
      target.linkedAt = target.linkedAt ?? now;
      if (!wasAlready) target.linkedAt = now;
      target.lastSeenAt = now;
      await accountRepo.save(target);

      await this.audit.record({
        action: wasAlready ? 'telegram.relink' : 'telegram.link',
        actorUserId: row.userId,
        actorType: 'telegram',
        resourceType: 'telegram_account',
        resourceId: target.id,
        result: 'success',
        metadata: { telegramUserId: profile.telegramUserId },
      });
      return wasAlready
        ? ({ status: 'already', userId: row.userId } as RedeemResult)
        : ({ status: 'linked', userId: row.userId } as RedeemResult);
    });
  }

  async unlinkByUser(userId: string, email: string | null): Promise<{ ok: boolean }> {
    const row = await this.accounts.findOne({ where: { userId, isActive: true } });
    if (!row) return { ok: false };
    await this.accounts.delete({ id: row.id } as never);
    await this.audit.record({
      action: 'telegram.unlink',
      actorUserId: userId,
      actorEmail: email,
      actorType: 'user',
      resourceType: 'telegram_account',
      resourceId: row.id,
      result: 'success',
    });
    return { ok: true };
  }

  async unlinkByTelegram(telegramUserId: string): Promise<{ ok: boolean }> {
    const row = await this.accounts.findOne({ where: { telegramUserId, isActive: true } });
    if (!row) return { ok: false };
    await this.accounts.delete({ id: row.id } as never);
    await this.audit.record({
      action: 'telegram.unlink',
      actorUserId: row.userId,
      actorType: 'telegram',
      resourceType: 'telegram_account',
      resourceId: row.id,
      result: 'success',
    });
    return { ok: true };
  }

  async accountForTelegram(telegramUserId: string): Promise<TelegramAccountEntity | null> {
    return this.accounts.findOne({ where: { telegramUserId, isActive: true } });
  }

  async activeAccountForUser(userId: string): Promise<TelegramAccountEntity | null> {
    return this.accounts.findOne({ where: { userId, isActive: true } });
  }

  async statusForUser(
    userId: string,
  ): Promise<{ linked: boolean; linkedAt: Date | null; telegramUsername: string | null }> {
    const row = await this.activeAccountForUser(userId);
    return {
      linked: Boolean(row),
      linkedAt: row?.linkedAt ?? null,
      telegramUsername: row?.telegramUsername ?? null,
    };
  }

  async touchLastSeen(telegramUserId: string): Promise<void> {
    await this.accounts.update({ telegramUserId }, { lastSeenAt: new Date() });
  }
}
