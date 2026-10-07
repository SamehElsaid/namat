import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Owner-editable packages (products). Seeds the current single product so
 * behaviour is unchanged until the owner edits it. Also stamps purchases and
 * entitlements with the package they belong to.
 */
export class Packages1710000012000 implements MigrationInterface {
  name = 'Packages1710000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS packages (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        code varchar(64) NOT NULL UNIQUE,
        "nameEn" varchar(128) NOT NULL,
        "nameAr" varchar(128) NOT NULL,
        "priceMinor" int NOT NULL,
        currency varchar(8) NOT NULL DEFAULT 'SAR',
        "maxDevices" int NOT NULL DEFAULT 1,
        "durationDays" int,
        "isPublished" boolean NOT NULL DEFAULT false,
        "sortOrder" int NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(
      `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "packageCode" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "packageMaxDevices" int`,
    );
    await queryRunner.query(
      `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "packageDurationDays" int`,
    );
    await queryRunner.query(
      `ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS "packageCode" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS "expiresAt" TIMESTAMPTZ`,
    );
    // Seed the current product as the first published package (idempotent).
    await queryRunner.query(`
      INSERT INTO packages (code, "nameEn", "nameAr", "priceMinor", currency, "maxDevices", "durationDays", "isPublished", "sortOrder")
      SELECT 'namat-lifetime', 'NAMAT Lifetime', 'نَمَط دائم', 29900, 'SAR', 1, NULL, true, 0
      WHERE NOT EXISTS (SELECT 1 FROM packages WHERE code = 'namat-lifetime');
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS packages`);
  }
}
