import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Additive Moyasar and owner-control columns.
 * Historical NearPay rows stay unchanged. Existing IPA files stay unpublished
 * until a cryptographic signature check succeeds.
 *
 * down() drops payment_settings, payment_credentials, and support_notes.
 * That deletes owner payment configuration and support notes. It is not the routine rollback procedure.
 * Roll back by deploying the previous application
 * image and leaving this schema in place. The added columns are nullable or
 * have defaults, so an older image can still read and write the migrated
 * database. Older images do not enforce the new publication gate.
 */
export class MoyasarOwnerControl1710000008000 implements MigrationInterface {
  name = 'MoyasarOwnerControl1710000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "providerMode" varchar(8);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "moyasarInvoiceId" varchar(64);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "moyasarPaymentId" varchar(64);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "providerState" varchar(32);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "paymentMethodType" varchar(32);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "paymentMethodBrand" varchar(32);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "paymentMethodLast4" varchar(4);
    `);
    await queryRunner.query(`
      ALTER TABLE purchases ADD COLUMN IF NOT EXISTS "invoiceExpiresAt" timestamptz;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS purchases_moyasar_invoice
      ON purchases ("moyasarInvoiceId")
      WHERE "moyasarInvoiceId" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS purchases_one_open_moyasar
      ON purchases ("userId")
      WHERE provider = 'moyasar' AND status IN ('pending', 'reserving');
    `);
    await queryRunner.query(`
      ALTER TABLE entitlements ADD COLUMN IF NOT EXISTS "grantSource" varchar(32);
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS result varchar(16) NOT NULL DEFAULT 'success';
    `);
    await queryRunner.query(`
      ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS "actorEmail" varchar(320);
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "signatureVerified" boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "signatureStatus" varchar(64) NOT NULL DEFAULT 'unverified';
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS published boolean NOT NULL DEFAULT false;
    `);
    await queryRunner.query(`
      ALTER TABLE app_versions ADD COLUMN IF NOT EXISTS "publishedAt" timestamptz;
    `);
    await queryRunner.query(`
      UPDATE app_versions
      SET published = false, "signatureVerified" = false, "signatureStatus" = 'unverified'
      WHERE published IS NULL OR "signatureVerified" IS NULL OR "ipaPath" IS NOT NULL;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_settings (
        id varchar(16) PRIMARY KEY,
        "checkoutEnabled" boolean NOT NULL DEFAULT false,
        mode varchar(8) NOT NULL DEFAULT 'test',
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      INSERT INTO payment_settings (id, "checkoutEnabled", mode)
      VALUES ('default', false, 'test')
      ON CONFLICT (id) DO NOTHING;
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_credentials (
        id varchar(16) PRIMARY KEY,
        "secretKeyCipher" text,
        "publishableKeyCipher" text,
        "webhookSecretCipher" text,
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS support_notes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL,
        "purchaseId" uuid,
        "actorUserId" uuid,
        "actorEmail" varchar(320),
        body text NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'open',
        outcome varchar(255),
        "createdAt" timestamptz NOT NULL DEFAULT now(),
        "updatedAt" timestamptz NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_support_notes_user ON support_notes ("userId");
    `);
  }

  /**
   * Destructive. Do not use this for a production rollback.
   * Deploy the previous image instead and keep the migrated schema.
   */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS support_notes;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_credentials;`);
    await queryRunner.query(`DROP TABLE IF EXISTS payment_settings;`);
    await queryRunner.query(`DROP INDEX IF EXISTS purchases_one_open_moyasar;`);
    await queryRunner.query(`DROP INDEX IF EXISTS purchases_moyasar_invoice;`);
  }
}
