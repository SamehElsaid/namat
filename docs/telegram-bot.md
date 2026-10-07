# NAMAT Telegram Bot

A companion Telegram bot for NAMAT customers. It is **not** a login method and
**not** a replacement for the NAMAT app — it lets a linked customer follow their
account, devices, designs and orders, open a support request, and receive
account/security alerts. Apply/Restore of Wallet artwork stays inside the iOS
app.

The integration is **optional and disabled by default**: with no
`TELEGRAM_BOT_TOKEN` the API runs normally and every outbound Telegram call is a
no-op.

---

## 1. Architecture

NestJS module at `services/api/src/modules/telegram/`:

| File | Role |
|------|------|
| `telegram.module.ts` | Wires the module; imports the domain modules it reads from. |
| `telegram.client.ts` | Thin Telegram Bot API client. Disabled when no token; never logs the token. |
| `telegram.controller.ts` | `POST /integrations/telegram/webhook` (public, secret-guarded) + authenticated link/unlink/status endpoints. |
| `telegram.update.ts` | Command & callback dispatch, support conversation, per-user rate limiting. |
| `telegram-linking.service.ts` | Single-use linking tokens, link/relink/unlink, status. |
| `telegram-notification.channel.ts` | Delivers notification events to a linked chat. |
| `telegram.types.ts` / `telegram.constants.ts` | Update types; Arabic copy and routing keys. |

Notifications use a decoupled fan-out bus at
`services/api/src/modules/notifications/` (`NotificationsService.emit(event)`).
Domain services emit events; channels (Telegram today; email/push/SMS later)
register themselves. The bus has no domain imports, which keeps the event flow
acyclic. Emission never throws into the request path.

Data is read from existing services only — no parallel data source:
`EntitlementsService`, `DevicesService`, `PurchasesService`, `SkinsService`,
`SupportService`, `UsersService`.

Full path note: the API global prefix is `api/v1`, so the webhook is served at
`/api/v1/integrations/telegram/webhook`.

---

## 2. Required environment variables

Add to deployment secrets (mirrored in `services/api/.env.example`):

| Var | Required | Purpose |
|-----|----------|---------|
| `TELEGRAM_BOT_TOKEN` | to enable | BotFather token. Empty = integration disabled. |
| `TELEGRAM_BOT_USERNAME` | to enable | Bot username (without `@`) used to build `t.me` deep links. |
| `TELEGRAM_WEBHOOK_SECRET` | to enable | Random secret echoed by Telegram in `X-Telegram-Bot-Api-Secret-Token`; the webhook rejects anything else. |
| `TELEGRAM_WEBHOOK_URL` | setup only | Public URL of the webhook, used by the setWebhook call. |
| `TELEGRAM_API_BASE` | no | Defaults to `https://api.telegram.org`. |
| `TELEGRAM_WEB_BASE` | no | Website base for "Open NAMAT" links. Defaults to `https://namat.shara.sa`. |

Never hardcode or commit a token/secret. Generate the webhook secret with e.g.
`openssl rand -hex 32`.

---

## 3. BotFather setup

Create the bot with [@BotFather](https://t.me/BotFather) and set:

**Name**
```
نَمَط | NAMAT
```

**About**
```
نَمَط | NAMAT 🇸🇦
تخصيص مظهر بطاقتك في Apple Wallet.
```

**Commands** (`/setcommands`)
```
start - بدء استخدام نَمَط
account - حسابي
designs - تصاميمي
devices - أجهزتي
orders - مشترياتي
support - الدعم
help - المساعدة
```

Put the token BotFather returns into `TELEGRAM_BOT_TOKEN` and the bot's username
into `TELEGRAM_BOT_USERNAME` (secrets, never committed).

---

## 4. Webhook setup

In production use a **webhook** (not long polling). Register it once after the
secrets are set:

```bash
curl -s "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -H 'content-type: application/json' \
  -d "{\"url\":\"${TELEGRAM_WEBHOOK_URL}\",\"secret_token\":\"${TELEGRAM_WEBHOOK_SECRET}\",\"allowed_updates\":[\"message\",\"callback_query\"]}"
```

`TELEGRAM_WEBHOOK_URL` must be `https://<api-host>/api/v1/integrations/telegram/webhook`.
Telegram then sends the secret in the `X-Telegram-Bot-Api-Secret-Token` header on
every delivery; the endpoint rejects any request whose secret does not match
(and rejects everything if no secret is configured). `TelegramClient.setWebhook`
performs the same call if you prefer to script it.

---

## 5. Account linking flow

Telegram ID alone is **never** accepted as identity. Linking always starts from
an authenticated NAMAT session:

```
NAMAT account (web)  → POST /integrations/telegram/link-token
                     → { deepLink: https://t.me/<bot>?start=<token> }
User opens deep link → Telegram sends /start <token> to the bot
Bot                  → redeem token server-side → link Telegram user ↔ NAMAT user
```

Token properties: 32 random bytes, **single-use**, **10-minute** expiry, stored
only as a SHA-256 hash, carries **no** account identifier. Issuing a new token
invalidates the user's earlier unused tokens. Redeem is transactional and
consumes the token before linking (replay-safe).

Rules enforced:
- At most one active link per NAMAT account and per Telegram user (unique
  indexes).
- A Telegram ID already active on **another** account is refused
  (`taken_by_other`) — no silent account switching.
- Re-linking the same pair is idempotent (`already`).
- Unlink (web button or the bot's inline button) removes the link; the Telegram
  ID is then free to link again.
- `linkedAt` is shown in `/account` and on the website.

The website entry point is the **"ربط تيليجرام"** button on the account page
(`apps/web` → `TelegramLink` component).

Endpoints (all authenticated except the webhook):
- `POST /integrations/telegram/link-token` → `{ deepLink, botUsername, expiresInSeconds }`
- `POST /integrations/telegram/unlink` → `{ ok }`
- `GET /integrations/telegram/link-status` → `{ linked, linkedAt, telegramUsername }`
- `POST /integrations/telegram/webhook` (public, secret-guarded)

---

## 6. Security model

- **No identity from Telegram ID** — only redeemed, session-minted tokens link.
- **Webhook authenticity** via the secret-token header, constant-time compared;
  fails closed when no secret is configured.
- **Tokens**: single-use, short-lived, hash-at-rest, no PII, replay-safe.
- **Per-Telegram-user rate limiting** in the update handler (20 actions/60s).
- **No secrets in messages or logs**: the bot never echoes tokens; the client
  never logs the bot token or request URL. Card data / CVV / PIN are never
  requested or shown.
- **No cross-account disclosure**: every command resolves the NAMAT user from
  the active link; an unlinked chat sees only a prompt to link.
- **Audit log** for `telegram.link`, `telegram.relink`, `telegram.unlink`, and
  `telegram.link_token_issued`.
- **Least data**: only Telegram user id / chat id / username / first name /
  language code are stored. No contacts, no phone number.

---

## 7. Supported commands

| Command | Shows |
|---------|-------|
| `/start` | Main menu (inline keyboard) or link prompt; `/start <token>` links the account. |
| `/account` | Account status, activation, devices used / allowed, link date. |
| `/devices` | Linked devices with status, and used/allowed count. |
| `/designs` | Published designs available to the user, with "Open in NAMAT". |
| `/orders` | Recent purchases (date, amount, status). |
| `/support` | Category picker → free-text message → creates a support note. |
| `/help` | Command list. |

Main-menu inline buttons: فتح نَمَط · حسابي · تصاميمي · أجهزتي · مشترياتي · الدعم.
Arabic is primary; English can be layered via the existing i18n later.

---

## 8. Notifications

`NotificationsService.emit({ type, userId, data })` fans out to registered
channels. Event types:

`ACCOUNT_LINKED`, `NEW_DEVICE`, `DEVICE_REMOVED`, `PURCHASE_COMPLETED`,
`NEW_DESIGN_AVAILABLE`, `SECURITY_ALERT`, `SUPPORT_UPDATE`.

Wired emitters today (guarded, best-effort):
- New device registered → `NEW_DEVICE` (a security alert to the linked chat).
- Device deactivated → `DEVICE_REMOVED`.
- Purchase approved (live) → `PURCHASE_COMPLETED`.
- Staff reply to a support note → `SUPPORT_UPDATE`.

To add email/push/SMS later, implement `NotificationChannel` and register it in
its module's `onModuleInit` — no domain code changes needed.

---

## 9. Local development

- Leave `TELEGRAM_BOT_TOKEN` empty: the API boots, all Telegram calls are
  no-ops, and the webhook returns `{ ok: true }` without processing.
- To exercise the bot locally, set the token + a webhook secret and expose the
  API with a tunnel (e.g. a reverse proxy) so Telegram can reach
  `/api/v1/integrations/telegram/webhook`, then run the setWebhook call.
- Tests never touch the real Telegram API (all mocked):
  `pnpm --filter @namat/api test telegram`.

---

## 10. Production deployment

1. Create the bot in BotFather; set name/about/commands (section 3).
2. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_WEBHOOK_SECRET`,
   `TELEGRAM_WEBHOOK_URL` in deployment secrets.
3. Deploy the API (the `Telegram1710000015000` migration creates
   `telegram_accounts` and `telegram_link_tokens`; it is additive and
   idempotent).
4. Register the webhook (section 4).
5. Verify: in the web account page, click "ربط تيليجرام", complete `/start` in
   Telegram, then try `/account` and `/devices`.

---

## 11. Troubleshooting

| Symptom | Check |
|---------|-------|
| Bot does not respond | Is `TELEGRAM_BOT_TOKEN` set? Is the webhook registered (`getWebhookInfo`)? |
| Webhook 401 | `TELEGRAM_WEBHOOK_SECRET` must equal the `secret_token` used in setWebhook. |
| "رابط الربط غير صالح" | Token expired (10 min) or already used — generate a new one from the account page. |
| "مرتبط بحساب نَمَط آخر" | That Telegram user is linked elsewhere; unlink there first. |
| Deep link button missing on site | `TELEGRAM_BOT_USERNAME` not set (link-token returns no deep link). |
| No notifications | User not linked, or token unset; emission is best-effort and never breaks the triggering action. |

---

## Deep links & iOS (follow-up)

The bot's "Open NAMAT" buttons use **https** links to the website
(`TELEGRAM_WEB_BASE`), which work today. The iOS app does **not** yet declare a
`namat://` URL scheme or universal links (only a Google Sign-In reversed-client
scheme exists in `apps/ios/Info.plist`, handled in `NamatAppMain.swift`
`onOpenURL`). To deep-link straight into a native screen later:

1. Add a `namat` URL scheme (or an `applinks:` associated domain) to
   `apps/ios/Info.plist` / `project.yml`.
2. Route it in `onOpenURL` to the matching screen (`account`, `designs`,
   `devices`, `support`).
3. Switch the bot's button URLs to the universal-link host once it is live.

No backend change is required for that step; the bot already centralizes link
building in `telegram.update.ts`.
