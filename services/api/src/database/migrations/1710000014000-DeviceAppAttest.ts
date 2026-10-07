import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Records a device's verified App Attest key, environment, and time. Nullable
 * so existing devices are unaffected; attestation stays optional until
 * NAMAT_REQUIRE_APP_ATTEST is enabled.
 */
export class DeviceAppAttest1710000014000 implements MigrationInterface {
  name = 'DeviceAppAttest1710000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS "appAttestKeyId" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS "appAttestEnv" varchar(16)`,
    );
    await queryRunner.query(
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS "attestedAt" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE devices DROP COLUMN IF EXISTS "attestedAt"`);
    await queryRunner.query(`ALTER TABLE devices DROP COLUMN IF EXISTS "appAttestEnv"`);
    await queryRunner.query(`ALTER TABLE devices DROP COLUMN IF EXISTS "appAttestKeyId"`);
  }
}
