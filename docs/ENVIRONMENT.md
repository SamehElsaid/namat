# Environment variables (names only)

New names, still without secret values: `OWNER_BOOTSTRAP_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `AI_API_KEY`, `AI_API_BASE_URL`, `AI_IMAGE_MODEL`, `NEARPAY_TERMINAL_ID`. Do not hardcode the owner email or any password.


Never commit secret values. Copy examples to local `.env` / `/opt/namat/secrets/namat.env`.

## API (`services/api`)

| Name | Purpose |
|------|---------|
| `NODE_ENV` | `development` / `production` |
| `PORT` | API listen port (prod: `3302`) |
| `API_PREFIX` | REST prefix (`api/v1`) |
| `DATABASE_HOST` | Postgres host |
| `DATABASE_PORT` | Postgres port |
| `DATABASE_USER` | DB user |
| `DATABASE_PASSWORD` | DB password |
| `DATABASE_NAME` | DB name |
| `DATABASE_SSL` | `true`/`false` |
| `TYPEORM_SYNC` | **`false` in production** after bootstrap. When false, API runs TypeORM migrations on boot |
| `TRUST_PROXY` | Express `trust proxy` hops (default `loopback, linklocal, uniquelocal`). Keeps per-IP rate limits per client behind Nginx + Docker |
| `JWT_SECRET` | Session signing secret |
| `JWT_EXPIRES_IN` | Token TTL |
| `OTP_TTL_SECONDS` | OTP lifetime |
| `OTP_LENGTH` | OTP digits |
| `OTP_MAX_ATTEMPTS` | Max verify attempts |
| `OTP_RATE_LIMIT_PER_EMAIL` | OTP request cap |
| `OTP_RATE_WINDOW_SECONDS` | OTP rate window |
| `ADMIN_API_TOKEN` | Bearer token for admin automation |
| `ADMIN_BOOTSTRAP_EMAIL` | Email promoted to admin on seed/login |
| `MOYASAR_SECRET_KEY` | Moyasar secret key. Server only. Required for Hosted Invoice create/verify/refund. `sk_test_` or `sk_live_` must match the selected mode |
| `MOYASAR_PUBLISHABLE_KEY` | Optional. Not required for Hosted Invoice checkout. Used only if a future client-side Create Payment / Form / SDK flow is enabled. If set, must match mode |
| `MOYASAR_WEBHOOK_SECRET` | Shared secret compared with webhook `secret_token`. Required for checkout readiness. Missing/wrong token rejects the webhook |
| `PAYMENT_CONFIG_KEY` | Encrypts owner-replaced payment secrets. Stays outside the database. Minimum 32 characters with sufficient diversity (`openssl rand -base64 32`) |
| `NEARPAY_API_KEY` | Historical NearPay terminal purchases only. Not used for new customer checkout |
| `NEARPAY_BASE_URL` | NearPay API base (`https://sandbox-api.nearpay.io`) |
| `NEARPAY_MERCHANT_ID` | Merchant id when provisioned |
| `NEARPAY_WEBHOOK_SECRET` | Optional webhook auth shared secret |
| `NEARPAY_CURRENCY` | ISO currency (`SAR`) |
| `NEARPAY_AMOUNT_HALALAS` | One-time price in minor units |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `UPLOAD_DIR` | Local skin/AI asset directory |
| `PUBLIC_BASE_URL` | Public origin for asset URLs and enrollment callbacks. Must be `https` in production |
| `ENROLLMENT_DATA_KEY` | Encrypts device identifiers and one-time enrollment tokens at rest. Required before a customer can register an iPhone |
| `ENROLLMENT_TTL_SECONDS` | Enrollment profile lifetime. Default `900` |
| `INSTALL_STRATEGY` | `AD_HOC_SELF_SERVICE`, `TESTFLIGHT`, `USER_SIDE_SIGNING`, or `UNAVAILABLE` |
| `APPLE_ISSUER_ID` | App Store Connect API issuer |
| `APPLE_KEY_ID` | App Store Connect API key id |
| `APPLE_PRIVATE_KEY` | App Store Connect API `.p8` PEM, newlines as `\n` |
| `APPLE_BUNDLE_ID` | Bundle id. Default `sa.shara.namat.app` |
| `APPLE_BUNDLE_ID_RESOURCE_ID` | App Store Connect bundle id resource, if already known |
| `APPLE_CERTIFICATE_ID` | Distribution certificate id used for Ad Hoc profiles |
| `APPLE_AD_HOC_DEVICE_LIMIT` | iPhone registration ceiling. Default `100`. This is not unlimited |
| `PROFILE_SIGNING_CERT` | PEM used to sign the enrollment `.mobileconfig`. Required in production |
| `PROFILE_SIGNING_KEY` | PEM key paired with `PROFILE_SIGNING_CERT`. Required in production |
| `SIGNING_CALLBACK_TOKEN` | Shared secret for the signing workflow to download a profile, upload the signed IPA, and report completion |
| `SIGNED_IPA_MAX_BYTES` | Maximum signed IPA upload. Default 200 MB |
| `ENROLLMENT_CMS_TRUST_BUNDLE_PEM` | PEM trust bundle for Profile Service callbacks. Required in production. System roots are not used |
| `ENROLLMENT_ALLOW_LEGACY_IPHONE_DEVICE_CA` | `true` also tries the expired 2014 Apple iPhone Device CA. Default false |
| `ENROLLMENT_CMS_DIAGNOSTIC` | `true` records signer metadata for the session owner and does not enroll the device |
| `GITHUB_DISPATCH_TOKEN` | Token allowed to dispatch `ios-customer-sign.yml` |
| `GITHUB_REPOSITORY` | `owner/name` for workflow dispatch |
| `GITHUB_SIGNING_WORKFLOW` | Workflow file name. Default `ios-customer-sign.yml` |
| `GITHUB_DISPATCH_REF` | Git ref that contains the signing workflow. Default `main` |
| `NAMAT_STABLE_SOURCE_COMMIT` | Verified Release commit. When unset, signing uses a full rebuild |
| `NAMAT_STABLE_AIRLIFT_SHA` | AirliftFFI SHA for that Release |
| `NAMAT_STABLE_APP_VERSION` | App version for that Release |
| `NAMAT_STABLE_BUILD_NUMBER` | Build number recorded on the signed IPA |
| `SMTP_HOST` | SMTP server hostname (empty → OTP email skipped) |
| `SMTP_PORT` | SMTP port (default `587`, `465` = implicit TLS) |
| `SMTP_USER` | SMTP auth user (optional if server allows unauthenticated relay) |
| `SMTP_PASSWORD` | SMTP auth password |
| `SMTP_FROM` | From header, e.g. `NAMAT <noreply@shara.sa>` (required with host) |
| `AI_API_KEY` | Live AI provider key (empty → mock provider; mock is OK for launch) |
| `LOG_LEVEL` | Structured log level |

### SMTP / OTP behavior

| Condition | Behavior |
|-----------|----------|
| `SMTP_HOST` + `SMTP_FROM` set | OTP emailed; production logs never include the code |
| SMTP absent + `NODE_ENV=production` | Challenge deleted; log lists missing `SMTP_*` names only; request fails with `EmailDeliveryUnavailable` and no code |
| SMTP absent + non-production | Dev log may include `devOtp` for local testing only |

### Google sign-in

`GOOGLE_IOS_CLIENT_ID` and `GOOGLE_SERVER_CLIENT_ID` are public OAuth client IDs. NAMAT does not use a Google client secret. The API accepts `POST /api/v1/auth/google` with an ID token and checks the signature, issuer, expiry, and audience against `GOOGLE_SERVER_CLIENT_ID`. The iOS client ID is not an accepted audience.

The stable identity is Google's `sub`, stored as `account_identities.providerSubject`. ID tokens, access tokens, and refresh tokens are not stored.

Linking policy:

- A known `sub` signs into that NAMAT account. Role, purchases, entitlement, and devices stay on that account.
- A new `sub` with `email_verified: true` and an existing NAMAT email is attached to that account. Role is not changed.
- An unverified email is rejected and is not used to create or merge an account.
- A second Google `sub` is not attached to an account that already has one.
- A new Google account is always role `user`. Google sign-in never grants the owner role and never opens the owner dashboard.
- `OWNER_BOOTSTRAP_EMAIL` promotes an existing account to `owner` only when that normalized email verifies an email OTP or an owner temporary login code. It does not grant a purchase entitlement.
- The owner dashboard then requires a one-time code and a password. Customer Google login is unchanged.

### Owner dashboard login

The first owner login uses a temporary code, then a password. Later logins use the email and that password. Password reset sends a new temporary code through the same email channel.

The code is random, hashed with bcrypt, single-use, and short-lived. Attempt limits and per-email rate limits apply. The plaintext is not written to logs.

When `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` are set, `POST /api/v1/auth/owner/code/request` and `POST /api/v1/auth/owner/password/forgot` email the code. When SMTP is not configured, those requests fail with `EmailDeliveryUnavailable` and no code is stored.

The server-side fallback is `services/api/scripts/issue-owner-login-code.cjs`. It requires `OWNER_BOOTSTRAP_EMAIL` and an existing user with that email. It stores only the hash and writes the code to a mode-600 file you choose. It does not print the code. Read the file over SSH, then delete it. Do not commit the file or paste the code into a pull request.

Google login does not send mail and does not require `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, or `SMTP_FROM`.

The customer website uses the same `POST /api/v1/auth/google` endpoint and the same server client ID, so a Google account on the web and on iPhone is the same NAMAT user.

### One iPhone

A purchase is one-time and lifetime. It activates one iPhone at a time. `NAMAT_MAX_DEVICES` is 1. Registration locks the entitlement row on Postgres and refuses a second active installation. Moving NAMAT is `POST /api/v1/devices/transfer`, limited to three transfers in 24 hours. Existing active rows are not deleted by the migration.

Apply also requires a device-bound P-256 signature. The private key stays in the iPhone Keychain (`ThisDeviceOnly`, not synchronized). The server stores the public point and a fingerprint. An installation id without that signature cannot authorize Apply. A copied installation that presents a new key for the same installation id is rejected.

`NAMAT_REQUIRE_APP_ATTEST` defaults to false so a Sideloadly engineering build can be tested. When it is true, Apply proof is refused until a real App Attest verifier exists. `POST /api/v1/devices/attestation` returns 501 and does not mark a device attested. Do not send a fake attestation.

### Device setup file

The iPhone cannot create the local setup file. It is the lockdown record created when this iPhone is trusted by a Mac. The customer imports that file in NAMAT. The app stores it privately and does not upload it. Local connection readiness is a separate check from that file.

### Restore safety

The first original card artwork is saved only on the iPhone, before the first Apply, and is never replaced by a later design. Apply B and Apply C do not overwrite original A. Restore writes A back. The backup is not deleted when the entitlement changes, the installation is revoked, or the session expires. Restore does not require a fresh activation proof. The backup is not uploaded.

The iOS OAuth client is registered for bundle ID `sa.shara.namat.app`. The unsigned IPA keeps that bundle ID. If a signing tool rewrites it, Google Sign-In will not work with this client. Do not substitute a different bundle ID in the Google client.

### NearPay

NearPay is **legacy only**. Historical terminal purchases stay on NearPay for refund/reversal. New online customer checkout uses Moyasar Hosted Invoice. Empty `NEARPAY_API_KEY` enables explicit mock mode for entitlement testing of historical paths. Mock ≠ sandbox merchant ≠ live settlement.

## Web / Admin

| Name | Purpose |
|------|---------|
| `NEXT_PUBLIC_API_BASE_URL` | Browser API base (`https://namat.shara.sa/api/v1`) |
| `NEXT_PUBLIC_PAYMENT_MODE` | `sandbox` or `live` (disclosure only) |

## Compose secrets file

See `infra/deploy/namat.env.example` for the production compose env file names.
