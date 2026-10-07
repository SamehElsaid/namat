import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Binds IPA publication evidence to the artifact SHA-256.
 * Nullable columns only. Older application images ignore them.
 *
 * down() drops the evidence columns. That is not the routine rollback
 * procedure. Deploy the previous image and keep this schema.
 */
export class IpaVerificationEvidence1710000009000 implements MigrationInterface {
  name = 'IpaVerificationEvidence1710000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "signatureSha256" varchar(64);
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "signatureExpiresAt" timestamptz;
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "signatureBundleId" varchar(255);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE app_versions DROP COLUMN IF EXISTS "signatureBundleId";`);
    await queryRunner.query(`ALTER TABLE app_versions DROP COLUMN IF EXISTS "signatureExpiresAt";`);
    await queryRunner.query(`ALTER TABLE app_versions DROP COLUMN IF EXISTS "signatureSha256";`);
  }
}
