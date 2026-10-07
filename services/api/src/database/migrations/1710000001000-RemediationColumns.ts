import { MigrationInterface, QueryRunner } from 'typeorm';

export class RemediationColumns1710000001000 implements MigrationInterface {
  name = 'RemediationColumns1710000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS label varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE compatibility_rules ADD COLUMN IF NOT EXISTS state varchar(32) NOT NULL DEFAULT 'SUPPORTED'`,
    );
    await queryRunner.query(
      `ALTER TABLE compatibility_rules ADD COLUMN IF NOT EXISTS "minAppVersion" varchar(64)`,
    );
    await queryRunner.query(
      `ALTER TABLE compatibility_rules ADD COLUMN IF NOT EXISTS "lastVerifiedAt" TIMESTAMPTZ`,
    );
    await queryRunner.query(
      `ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS checksum varchar(128)`,
    );
    await queryRunner.query(
      `ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "ipaPath" varchar(512)`,
    );
  }

  public async down(): Promise<void> {
    // Additive columns stay. Destructive rollback is not part of this migration.
  }
}
