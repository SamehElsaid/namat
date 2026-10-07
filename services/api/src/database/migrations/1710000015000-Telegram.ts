import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Telegram companion channel: account links and single-use linking tokens.
 * Additive and idempotent; no existing table is touched.
 */
export class Telegram1710000015000 implements MigrationInterface {
  name = 'Telegram1710000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telegram_accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "telegramUserId" varchar(32) NOT NULL,
        "telegramChatId" varchar(32),
        "telegramUsername" varchar(64),
        "telegramFirstName" varchar(128),
        "telegramLanguageCode" varchar(8),
        "linkedAt" TIMESTAMPTZ,
        "lastSeenAt" TIMESTAMPTZ,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT fk_telegram_accounts_user FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_telegram_accounts_user" ON telegram_accounts ("userId")`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_telegram_accounts_tg_user" ON telegram_accounts ("telegramUserId")`,
    );

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS telegram_link_tokens (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "tokenHash" varchar(64) NOT NULL,
        "userId" uuid NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "consumedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_telegram_link_tokens_hash" ON telegram_link_tokens ("tokenHash")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "ix_telegram_link_tokens_user" ON telegram_link_tokens ("userId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS telegram_link_tokens`);
    await queryRunner.query(`DROP TABLE IF EXISTS telegram_accounts`);
  }
}
