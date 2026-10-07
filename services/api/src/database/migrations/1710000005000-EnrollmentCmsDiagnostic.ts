import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnrollmentCmsDiagnostic1710000005000 implements MigrationInterface {
  name = 'EnrollmentCmsDiagnostic1710000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE device_enrollments ADD COLUMN IF NOT EXISTS "cmsDiagnostic" text`,
    );
  }

  public async down(): Promise<void> {
    // The diagnostic column stays. Destructive rollback is not part of this migration.
  }
}
