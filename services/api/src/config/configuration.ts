import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseInt(process.env.PORT ?? '3302', 10),
  apiPrefix: process.env.API_PREFIX ?? 'api/v1',
  corsOrigins: (process.env.CORS_ORIGINS ??
    'https://namat.shara.sa,https://admin.namat.shara.sa')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  trustProxy: process.env.TRUST_PROXY ?? 'loopback, linklocal, uniquelocal',
  jwtSecret: process.env.JWT_SECRET ?? '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '30d',
  otpTtlSeconds: parseInt(process.env.OTP_TTL_SECONDS ?? '600', 10),
  otpLength: parseInt(process.env.OTP_LENGTH ?? '6', 10),
  otpMaxAttempts: parseInt(process.env.OTP_MAX_ATTEMPTS ?? '5', 10),
  otpRateLimitPerEmail: parseInt(process.env.OTP_RATE_LIMIT_PER_EMAIL ?? '5', 10),
  otpRateWindowSeconds: parseInt(
    process.env.OTP_RATE_WINDOW_SECONDS ?? '900',
    10,
  ),
  otpCooldownSeconds: parseInt(process.env.OTP_COOLDOWN_SECONDS ?? '60', 10),
  ownerCodeTtlSeconds: parseInt(process.env.OWNER_CODE_TTL_SECONDS ?? '900', 10),
  ownerCodeMaxAttempts: parseInt(process.env.OWNER_CODE_MAX_ATTEMPTS ?? '5', 10),
  ownerCodeRateLimitPerEmail: parseInt(
    process.env.OWNER_CODE_RATE_LIMIT_PER_EMAIL ?? '3',
    10,
  ),
  ownerCodeRateWindowSeconds: parseInt(
    process.env.OWNER_CODE_RATE_WINDOW_SECONDS ?? '900',
    10,
  ),
  ownerCodeCooldownSeconds: parseInt(
    process.env.OWNER_CODE_COOLDOWN_SECONDS ?? '60',
    10,
  ),
  loginCodeHashRounds: parseInt(process.env.LOGIN_CODE_HASH_ROUNDS ?? '10', 10),
  passwordHashRounds: parseInt(process.env.PASSWORD_HASH_ROUNDS ?? '12', 10),
  passwordMaxAttempts: parseInt(process.env.PASSWORD_MAX_ATTEMPTS ?? '5', 10),
  passwordLockSeconds: parseInt(process.env.PASSWORD_LOCK_SECONDS ?? '900', 10),
  adminApiToken: process.env.ADMIN_API_TOKEN ?? '',
  adminBootstrapEmail: process.env.ADMIN_BOOTSTRAP_EMAIL ?? '',
  ownerBootstrapEmail: process.env.OWNER_BOOTSTRAP_EMAIL ?? '',
  // Public OAuth client IDs. Not a client secret. Audience checks use the server ID only.
  googleIosClientId:
    (process.env.GOOGLE_IOS_CLIENT_ID ?? '').trim() ||
    '588751829801-o1l3gdt9fcquhn4ncq5kgig10c7fb0tq.apps.googleusercontent.com',
  googleServerClientId:
    (process.env.GOOGLE_SERVER_CLIENT_ID ?? '').trim() ||
    '588751829801-hncn7v533cpfbbhj6f6nodi7emk92spf.apps.googleusercontent.com',
  aiApiKey: process.env.AI_API_KEY ?? '',
  aiApiBaseUrl:
    process.env.AI_API_BASE_URL ?? 'https://api.openai.com/v1',
  aiModel: process.env.AI_IMAGE_MODEL ?? 'gpt-image-1',
  nearpayApiKey: process.env.NEARPAY_API_KEY ?? '',
  nearpayBaseUrl:
    process.env.NEARPAY_BASE_URL ?? 'https://sandbox-api.nearpay.io',
  nearpayMerchantId: process.env.NEARPAY_MERCHANT_ID ?? '',
  nearpayMerchantUuid: process.env.NEARPAY_MERCHANT_UUID ?? '',
  nearpayTerminalId: process.env.NEARPAY_TERMINAL_ID ?? '',
  nearpayJwtPrivateKey: (process.env.NEARPAY_JWT_PRIVATE_KEY ?? '').replace(
    /\\n/g,
    '\n',
  ),
  aiMonthlyGenerationLimit: parseInt(
    process.env.AI_MONTHLY_GENERATION_LIMIT ?? '20',
    10,
  ),
  nearpayWebhookSecret: process.env.NEARPAY_WEBHOOK_SECRET ?? '',
  moyasarSecretKey: process.env.MOYASAR_SECRET_KEY ?? '',
  moyasarPublishableKey: process.env.MOYASAR_PUBLISHABLE_KEY ?? '',
  moyasarWebhookSecret: process.env.MOYASAR_WEBHOOK_SECRET ?? '',
  paymentConfigKey: process.env.PAYMENT_CONFIG_KEY ?? '',
  nearpayCurrency: process.env.NEARPAY_CURRENCY ?? 'SAR',
  nearpayAmountHalalas: parseInt(
    process.env.NEARPAY_AMOUNT_HALALAS ?? '29900',
    10,
  ),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads',
  publicBaseUrl: process.env.PUBLIC_BASE_URL ?? 'http://127.0.0.1:3302',
  installStrategy: process.env.INSTALL_STRATEGY ?? 'AD_HOC_SELF_SERVICE',
  enrollmentDataKey: process.env.ENROLLMENT_DATA_KEY ?? '',
  enrollmentTtlSeconds: parseInt(process.env.ENROLLMENT_TTL_SECONDS ?? '900', 10),
  appleIssuerId: process.env.APPLE_ISSUER_ID ?? '',
  appleKeyId: process.env.APPLE_KEY_ID ?? '',
  applePrivateKey: (process.env.APPLE_PRIVATE_KEY ?? '').replace(/\\n/g, '\n'),
  appleBundleId: process.env.APPLE_BUNDLE_ID ?? 'sa.shara.namat.app',
  appleBundleResourceId: process.env.APPLE_BUNDLE_ID_RESOURCE_ID ?? '',
  appleCertificateId: process.env.APPLE_CERTIFICATE_ID ?? '',
  appleAdHocDeviceLimit: parseInt(
    process.env.APPLE_AD_HOC_DEVICE_LIMIT ?? '100',
    10,
  ),
  profileSigningCert: (process.env.PROFILE_SIGNING_CERT ?? '').replace(
    /\\n/g,
    '\n',
  ),
  profileSigningKey: (process.env.PROFILE_SIGNING_KEY ?? '').replace(
    /\\n/g,
    '\n',
  ),
  githubDispatchToken: process.env.GITHUB_DISPATCH_TOKEN ?? '',
  githubRepository: process.env.GITHUB_REPOSITORY ?? 'sharahsa0-creator/namat',
  githubSigningWorkflow:
    process.env.GITHUB_SIGNING_WORKFLOW ?? 'ios-customer-sign.yml',
  githubDispatchRef: process.env.GITHUB_DISPATCH_REF ?? 'main',
  signingCallbackToken: process.env.SIGNING_CALLBACK_TOKEN ?? '',
  signedIpaMaxBytes: parseInt(
    process.env.SIGNED_IPA_MAX_BYTES ?? `${200 * 1024 * 1024}`,
    10,
  ),
  enrollmentCmsTrustBundlePem: (
    process.env.ENROLLMENT_CMS_TRUST_BUNDLE_PEM ?? ''
  ).replace(/\\n/g, '\n'),
  enrollmentAllowLegacyIphoneDeviceCa:
    process.env.ENROLLMENT_ALLOW_LEGACY_IPHONE_DEVICE_CA === 'true',
  enrollmentCmsDiagnostic: process.env.ENROLLMENT_CMS_DIAGNOSTIC === 'true',
  stableSourceCommit: process.env.NAMAT_STABLE_SOURCE_COMMIT ?? '',
  stableAirliftSha: process.env.NAMAT_STABLE_AIRLIFT_SHA ?? '',
  stableAppVersion: process.env.NAMAT_STABLE_APP_VERSION ?? '',
  stableBuildNumber: process.env.NAMAT_STABLE_BUILD_NUMBER ?? '',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  // When true, Apply proof requires a real App Attest verification that this
  // build does not perform. Leave false for Sideloadly engineering builds.
  requireAppAttest: process.env.NAMAT_REQUIRE_APP_ATTEST === 'true',
  // App Attest verification inputs. Without a root CA the verifier rejects.
  appAttestTeamId: process.env.APPLE_TEAM_ID ?? '',
  appAttestBundleId: process.env.NAMAT_IOS_BUNDLE_ID ?? 'sa.shara.namat',
  appAttestRootCaPem: (process.env.APP_ATTEST_ROOT_CA_PEM ?? '').replace(/\\n/g, '\n'),
  appAttestAllowDevelopment: process.env.NAMAT_APP_ATTEST_ALLOW_DEV === 'true',
  // Telegram companion bot. With no bot token the integration is disabled and
  // the API runs normally; no token or secret is ever hardcoded.
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN ?? '',
    botUsername: process.env.TELEGRAM_BOT_USERNAME ?? '',
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? '',
    webhookUrl: process.env.TELEGRAM_WEBHOOK_URL ?? '',
    apiBase: process.env.TELEGRAM_API_BASE ?? 'https://api.telegram.org',
    // Website base used for "Open NAMAT" deep links shown in the bot.
    webBase: process.env.TELEGRAM_WEB_BASE ?? process.env.NAMAT_PUBLIC_WEB_ORIGIN ?? 'https://namat.shara.sa',
  },
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: parseInt(process.env.SMTP_PORT ?? '587', 10),
    user: process.env.SMTP_USER ?? '',
    password: process.env.SMTP_PASSWORD ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
  database: {
    host: process.env.DATABASE_HOST ?? 'localhost',
    port: parseInt(process.env.DATABASE_PORT ?? '5432', 10),
    username: process.env.DATABASE_USER ?? 'namat',
    password: process.env.DATABASE_PASSWORD ?? '',
    database: process.env.DATABASE_NAME ?? 'namat',
    ssl: process.env.DATABASE_SSL === 'true',
    synchronize: process.env.TYPEORM_SYNC === 'true',
  },
}));
