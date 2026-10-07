import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner dashboard login uses a hashed temporary code and a password.
 * Nullable columns and a new table. Older application images ignore them.
 *
 * down() drops the owner-login columns and login_codes. That is not the routine rollback
 * procedure. Deploy the previous image and keep this schema.
 */
export class OwnerPasswordLogin1710000010000 implements MigrationInterface {
  name = 'OwnerPasswordLogin1710000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordHash" varchar(255);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordSetAt" timestamptz;
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordFailedAttempts" integer NOT NULL DEFAULT 0;
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS "passwordLockedUntil" timestamptz;
    `);
    await queryRunner.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS purpose varchar(32);
    `);
    await queryRunner.query(`
      ALTER TABLE sessions ADD COLUMN IF NOT EXISTS "loginCodeId" uuid;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS login_codes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        email varchar(320) NOT NULL,
        purpose varchar(32) NOT NULL,
        "codeHash" varchar(128) NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        "expiresAt" timestamptz NOT NULL,
        "consumedAt" timestamptz,
        "createdAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS login_codes_email_created
      ON login_codes (email, "createdAt");
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS login_codes;`);
    await queryRunner.query(`ALTER TABLE sessions DROP COLUMN IF EXISTS "loginCodeId";`);
    await queryRunner.query(`ALTER TABLE sessions DROP COLUMN IF EXISTS purpose;`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "passwordLockedUntil";`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "passwordFailedAttempts";`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "passwordSetAt";`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS "passwordHash";`);
  }
}
