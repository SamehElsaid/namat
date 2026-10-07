import { MigrationInterface, QueryRunner } from 'typeorm';

export class AccountIdentities1710000006000 implements MigrationInterface {
  name = 'AccountIdentities1710000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS account_identities (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        provider varchar(32) NOT NULL,
        "providerSubject" varchar(255) NOT NULL,
        email varchar(320) NOT NULL,
        "emailVerified" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT account_identities_provider_subject UNIQUE (provider, "providerSubject"),
        CONSTRAINT account_identities_user_provider UNIQUE ("userId", provider)
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_account_identities_user
      ON account_identities("userId");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS account_identities;`);
  }
}
