import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Customer-opened support threads. Adds a subject, a source (customer vs
 * staff), and a staff reply the customer can read back. Existing notes keep
 * source 'staff' so the admin view is unchanged.
 */
export class CustomerSupport1710000013000 implements MigrationInterface {
  name = 'CustomerSupport1710000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS source varchar(16) NOT NULL DEFAULT 'staff'`,
    );
    await queryRunner.query(
      `ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS subject varchar(200)`,
    );
    await queryRunner.query(
      `ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS reply text`,
    );
    await queryRunner.query(
      `ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS "repliedByEmail" varchar(320)`,
    );
    await queryRunner.query(
      `ALTER TABLE support_notes ADD COLUMN IF NOT EXISTS "repliedAt" TIMESTAMPTZ`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE support_notes DROP COLUMN IF EXISTS "repliedAt"`);
    await queryRunner.query(`ALTER TABLE support_notes DROP COLUMN IF EXISTS "repliedByEmail"`);
    await queryRunner.query(`ALTER TABLE support_notes DROP COLUMN IF EXISTS reply`);
    await queryRunner.query(`ALTER TABLE support_notes DROP COLUMN IF EXISTS subject`);
    await queryRunner.query(`ALTER TABLE support_notes DROP COLUMN IF EXISTS source`);
  }
}
