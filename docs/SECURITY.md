# NAMAT Security

Production refuses a missing or `dev-only-change-me` JWT secret. Production mock checkout cannot grant an entitlement. Browser sessions use the HttpOnly `namat_session` cookie plus `X-Namat-Request` on mutations. NearPay webhooks are stripped of card fields before persistence. Nginx config adds HSTS, CSP, and Permissions-Policy; applying it on the host is an operator step.


## Principles

1. **Wallet data stays on the iPhone.** Backend, CDN, analytics, and AI must never receive:
   - PAN / card number
   - CVV
   - PIN
   - Bank credentials
   - Apple Pay payment tokens
   - Wallet card identifiers / pass hashes / local keys (unless a later security review proves a non-sensitive surrogate is required — default is **never**)
2. **No secrets in Git.** Use env injection / secret managers. Ignore `.env*`, signing certs, private keys.
3. **Admin is private.** `admin.namat.shara.sa` (or equivalent) requires authentication; no open admin.
4. **Do not touch production DNS/Nginx** until the live host is audited and `infra/deploy/ROLLBACK.md` is real.
5. **AirCard-derived code** preserves MIT / third-party notices; prefer rebuilding AirliftFFI from source.

---

## Trust zones

| Zone | Allowed data | Forbidden |
|------|--------------|-----------|
| On-device Wallet engine | Pairing file, pass hashes, artwork bytes, local backups | Exfiltration to NAMAT/AI |
| NAMAT API | Account, entitlement, device records, skin IDs, remote config | Any Wallet secrets above |
| Skin CDN | Artwork images, manifests, content hashes | User Wallet identifiers |
| AI Skin Studio | Prompts, styles, generated images, moderation labels | Wallet card data / pairing |
| Logs / analytics | Coarse errors, non-identifying event names | Pass hashes, PAN, pairing material, syslog dumps |

---

## iOS requirements

- Implement `WalletSkinEngine` so exploit/FFI details are not leaked into UI or networking layers.
- Redact local keys from UI logs in production builds.
- Exclude pairing files from cloud backup when feasible.
- Backup original artwork **on-device** before Apply; Restore reads only local backup.
- Network allowlist for the app should not be required for Apply/Restore (local loopback only).
- Future crash reporters must scrub Wallet identifiers.

---

## API requirements

- Schema review gate: reject PRs that add Wallet identifier fields.
- Entitlement/device APIs identify **NAMAT device installation IDs**, not Apple Pass IDs.
- Webhooks (payments) verified; no card art metadata that includes Wallet hashes.
- Rate-limit auth OTP; lock down admin routes.

---

## AI isolation

AI Skin Studio is a **first-class product area** but a **separate data path**:

`prompt + style → generate → preview → save`

Never concatenate Wallet discovery output into AI requests. Client applies generated artwork through the local engine only after download of the image asset.

---

## Server change control

1. Inventory host (OS, listeners, Nginx, Docker, DB, existing sites).
2. Write rollback (DNS + config snapshots + restore commands).
3. Apply minimal change.
4. Verify.
5. Keep rollback artifacts.

Phase 0 made **zero** live server changes. Staging SSH material exists in the agent environment but the staging hostname was not identified — treat production as unaudited.

---

## Incident notes

If Wallet identifiers are ever found in server logs: rotate affected credentials if any, purge logs, patch redaction, and treat as a privacy incident even if PAN was not present.
