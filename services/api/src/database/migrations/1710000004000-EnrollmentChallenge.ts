import { MigrationInterface, QueryRunner } from 'typeorm';

export class EnrollmentChallenge1710000004000 implements MigrationInterface {
  name = 'EnrollmentChallenge1710000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE device_enrollments ADD COLUMN IF NOT EXISTS "challengeCipher" text`,
    );
  }

  public async down(): Promise<void> {
    // The challenge column stays. Destructive rollback is not part of this migration.
  }
}
