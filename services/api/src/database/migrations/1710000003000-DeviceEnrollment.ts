import { MigrationInterface, QueryRunner } from 'typeorm';

export class DeviceEnrollment1710000003000 implements MigrationInterface {
  name = 'DeviceEnrollment1710000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE devices ADD COLUMN IF NOT EXISTS "installationTokenHash" varchar(128)`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS device_enrollments (
        id uuid PRIMARY KEY,
        "userId" uuid NOT NULL,
        "tokenHash" varchar(64) NOT NULL UNIQUE,
        "tokenCipher" text,
        status varchar(32) NOT NULL,
        "signingStatus" varchar(32),
        "installStrategy" varchar(32) NOT NULL,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "consumedAt" TIMESTAMPTZ,
        "deactivatedAt" TIMESTAMPTZ,
        "udidCipher" text,
        "udidFingerprint" varchar(64),
        product varchar(64),
        "iosVersion" varchar(32),
        "appleDeviceId" varchar(64),
        "appleState" varchar(32),
        "profileId" varchar(64),
        "failureCode" varchar(64),
        label varchar(128),
        "namatInstallationId" varchar(128),
        "activatedAt" TIMESTAMPTZ,
        "manifestTokenHash" varchar(64),
        "manifestExpiresAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS device_enrollments_user_idx ON device_enrollments ("userId")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS device_enrollments_fp_idx ON device_enrollments ("udidFingerprint")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signing_jobs (
        id uuid PRIMARY KEY,
        "enrollmentId" uuid NOT NULL,
        status varchar(32) NOT NULL,
        mode varchar(32) NOT NULL,
        attempt integer NOT NULL DEFAULT 1,
        "failureCode" varchar(64),
        "ipaSha256" varchar(64),
        "profileIdentifier" varchar(128),
        "profileCipher" text,
        "appVersion" varchar(32),
        "buildNumber" varchar(32),
        "sourceCommit" varchar(64),
        "airliftSha" varchar(64),
        "artifactRelativePath" varchar(512),
        "signingTimestamp" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS signing_jobs_enrollment_idx ON signing_jobs ("enrollmentId")`,
    );
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS signing_locks (
        id varchar(32) PRIMARY KEY,
        "ownerJobId" varchar(64),
        "lockedUntil" TIMESTAMPTZ
      )
    `);
  }

  public async down(): Promise<void> {
    // Additive enrollment tables stay. Destructive rollback is not part of this migration.
  }
}
