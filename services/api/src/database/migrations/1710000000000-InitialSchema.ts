import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1710000000000 implements MigrationInterface {
  name = 'InitialSchema1710000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(320) NOT NULL UNIQUE,
        role varchar(32) NOT NULL DEFAULT 'user',
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "tokenHash" varchar(128) NOT NULL UNIQUE,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "revokedAt" TIMESTAMPTZ,
        "userAgent" varchar(64),
        "ipHash" varchar(64),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions("userId");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS otp_challenges (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        email varchar(320) NOT NULL,
        "codeHash" varchar(128) NOT NULL,
        attempts int NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMPTZ NOT NULL,
        "consumedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_challenges(email);
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS purchases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status varchar(32) NOT NULL DEFAULT 'pending',
        "amountMinor" int NOT NULL,
        currency varchar(8) NOT NULL DEFAULT 'SAR',
        provider varchar(32) NOT NULL DEFAULT 'nearpay',
        "customerReferenceNumber" varchar(64) NOT NULL UNIQUE,
        "nearpayTransactionId" varchar(128),
        "nearpayMerchantId" varchar(128),
        "nearpayTerminalId" varchar(128),
        "retrievalReferenceNumber" varchar(64),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_purchases_user ON purchases("userId");
      CREATE INDEX IF NOT EXISTS idx_purchases_tx ON purchases("nearpayTransactionId");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS entitlements (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        "purchaseId" uuid REFERENCES purchases(id) ON DELETE SET NULL,
        status varchar(32) NOT NULL DEFAULT 'active',
        plan varchar(64) NOT NULL DEFAULT 'lifetime',
        "maxDevices" int NOT NULL DEFAULT 2,
        "revokedAt" TIMESTAMPTZ,
        "revokeReason" varchar(255),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS devices (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        "installationId" varchar(128) NOT NULL UNIQUE,
        "appVersion" varchar(64),
        "iosVersion" varchar(64),
        status varchar(32) NOT NULL DEFAULT 'active',
        "lastSeenAt" TIMESTAMPTZ,
        "deactivatedAt" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user ON devices("userId");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS categories (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(64) NOT NULL UNIQUE,
        name varchar(128) NOT NULL,
        "nameAr" varchar(128),
        "sortOrder" int NOT NULL DEFAULT 0,
        "isActive" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skins (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        slug varchar(64) NOT NULL UNIQUE,
        name varchar(128) NOT NULL,
        "nameAr" varchar(128),
        description text,
        "categoryId" uuid REFERENCES categories(id) ON DELETE SET NULL,
        status varchar(32) NOT NULL DEFAULT 'draft',
        "currentVersion" int NOT NULL DEFAULT 1,
        "contentHash" varchar(128),
        "thumbnailPath" varchar(512),
        "artworkPath" varchar(512),
        "sortOrder" int NOT NULL DEFAULT 0,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "publishedAt" TIMESTAMPTZ
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS skin_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "skinId" uuid NOT NULL REFERENCES skins(id) ON DELETE CASCADE,
        version int NOT NULL,
        "contentHash" varchar(128) NOT NULL,
        "artworkPath" varchar(512) NOT NULL,
        "thumbnailPath" varchar(512),
        metadata json,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        UNIQUE("skinId", version)
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS assets (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar(128) NOT NULL UNIQUE,
        path varchar(512) NOT NULL,
        "mimeType" varchar(128) NOT NULL,
        "byteSize" int NOT NULL DEFAULT 0,
        "contentHash" varchar(128),
        "storageBackend" varchar(64) NOT NULL DEFAULT 'local',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS compatibility_rules (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "minIosVersion" varchar(64) NOT NULL,
        "maxIosVersion" varchar(64),
        "supportedModels" text,
        "isSupported" boolean NOT NULL DEFAULT true,
        notes text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS app_versions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        version varchar(64) NOT NULL UNIQUE,
        "isMandatory" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "downloadUrl" varchar(512),
        "releaseNotes" text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS remote_config (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        key varchar(64) NOT NULL UNIQUE DEFAULT 'default',
        "killSwitchApply" boolean NOT NULL DEFAULT false,
        "killSwitchRestore" boolean NOT NULL DEFAULT false,
        "minAppVersion" varchar(64) NOT NULL DEFAULT '1.0.0',
        "minIosVersion" varchar(64) NOT NULL DEFAULT '16.0',
        "maintenanceMode" boolean NOT NULL DEFAULT false,
        message text,
        extras text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS analytics_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        name varchar(64) NOT NULL,
        "userId" uuid,
        "installationId" varchar(128),
        properties text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_analytics_name ON analytics_events(name);
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        action varchar(64) NOT NULL,
        "actorUserId" uuid,
        "actorType" varchar(64),
        "resourceType" varchar(64),
        "resourceId" varchar(128),
        metadata text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS ai_generations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "userId" uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        prompt text NOT NULL,
        "stylePresetId" varchar(64),
        "referenceImageUrl" varchar(512),
        status varchar(32) NOT NULL DEFAULT 'queued',
        "resultAssetPath" varchar(512),
        "errorMessage" text,
        metadata text,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_ai_user ON ai_generations("userId");
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS payment_webhook_events (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "providerEventKey" varchar(128) NOT NULL UNIQUE,
        provider varchar(32) NOT NULL DEFAULT 'nearpay',
        "eventType" varchar(64) NOT NULL,
        "transactionId" varchar(128),
        "customerReferenceNumber" varchar(64),
        status varchar(32),
        "amountMinor" int,
        currency varchar(8),
        "merchantId" varchar(128),
        "terminalId" varchar(128),
        processed boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const tables = [
      'payment_webhook_events',
      'ai_generations',
      'audit_logs',
      'analytics_events',
      'remote_config',
      'app_versions',
      'compatibility_rules',
      'assets',
      'skin_versions',
      'skins',
      'categories',
      'devices',
      'entitlements',
      'purchases',
      'otp_challenges',
      'sessions',
      'users',
    ];
    for (const t of tables) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${t} CASCADE;`);
    }
  }
}
