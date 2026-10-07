import { MigrationInterface, QueryRunner } from 'typeorm';

export class NearpayJobId1710000002000 implements MigrationInterface {
  name = 'NearpayJobId1710000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "nearpayJobId" varchar(64)`,
    );
  }

  public async down(): Promise<void> {
    // Additive column stays.
  }
}
