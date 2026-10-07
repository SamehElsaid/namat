import { MigrationInterface, QueryRunner } from 'typeorm';

/** Install-link lookups query by manifest token hash on a public route. */
export class EnrollmentManifestIndex1710000011000 implements MigrationInterface {
  name = 'EnrollmentManifestIndex1710000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_enrollments_manifest_token" ON device_enrollments ("manifestTokenHash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_device_enrollments_manifest_token"`,
    );
  }
}
