# AI Skin Studio

IMPLEMENTED: a non-empty `AI_API_KEY` selects `OpenAiImageProvider`. Without a key, production generation is unavailable and development uses the mock provider, which is not production AI. Wallet identifiers are rejected. No live generation was executed because no key is present.


AI is a **first-class product path** and a **separate data path** from Wallet operations.

## Flow

1. User enters text prompt (+ optional style preset, optional non-Wallet reference image).
2. API enqueues/generates artwork at 1536×969.
3. User previews result.
4. User may save to personal library and apply **locally** via `WalletSkinEngine`.

## Hard rules

Forbidden in AI requests:

- PAN / CVV / PIN
- Apple Pay tokens
- Wallet local keys / pass hashes
- Pairing files / syslog extracts
- Screenshots that embed card PAN

Allowed: prompt text, style id, target dimensions, user-owned reference art that is not Wallet-secret material.

## Provider interface

```ts
interface AiSkinProvider {
  generate(input: AiSkinGenerateInput): Promise<AiSkinGenerateResult>;
}
```

- Default: `MockAiSkinProvider` when `AI_API_KEY` is unset (**OK for launch**).
- Production: swap provider implementation behind the same interface; do not change Wallet code.
- Input contract forbids Wallet secrets (enforced by `PrivacyGuard` + provider interface comments).

## Activation note (2026-10-02)

Live API uses mock AI. Abstraction: `AiSkinProvider` / `MockAiSkinProvider`. No Wallet card data fields are accepted on AI endpoints.

## Moderation

Admin can list generations and mark `moderated` / `completed`. IP/trademark guardrails are product policy — block/flag in admin before public library promotion.

## Endpoints

- `POST /api/v1/ai/generations` (auth)
- `GET /api/v1/ai/generations` (auth, own)
- `GET /api/v1/admin/ai-generations`
- `POST /api/v1/admin/ai-generations/:id/moderate`
