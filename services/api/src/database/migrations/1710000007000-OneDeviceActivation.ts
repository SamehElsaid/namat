import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One active iPhone per purchase.
 * Existing active rows are left in place so a current test installation
 * is not revoked by the migration. New activations are refused while one
 * is already active.
 * The shipping app is 0.1.0. A leftover minAppVersion of 1.0.0 blocked it.
 */
export class OneDeviceActivation1710000007000 implements MigrationInterface {
  name = 'OneDeviceActivation1710000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS "publicKeyPoint" varchar(180);
    `);
    await queryRunner.query(`
      ALTER TABLE devices ADD COLUMN IF NOT EXISTS "publicKeyFingerprint" varchar(64);
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "deviceId" uuid NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
        "nonceHash" varchar(64) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "consumedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_device_challenges_device
      ON device_challenges("deviceId");
    `);
    await queryRunner.query(`
      UPDATE entitlements SET "maxDevices" = 1 WHERE "maxDevices" > 1;
    `);
    await queryRunner.query(`
      ALTER TABLE entitlements ALTER COLUMN "maxDevices" SET DEFAULT 1;
    `);
    await queryRunner.query(`
      UPDATE remote_config
      SET "minAppVersion" = '0.1.0'
      WHERE key = 'default' AND "minAppVersion" = '1.0.0';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS device_challenges;`);
    await queryRunner.query(`
      ALTER TABLE devices DROP COLUMN IF EXISTS "publicKeyPoint";
    `);
    await queryRunner.query(`
      ALTER TABLE devices DROP COLUMN IF EXISTS "publicKeyFingerprint";
    `);
  }
}
