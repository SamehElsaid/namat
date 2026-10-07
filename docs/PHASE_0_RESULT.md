# Phase 0 Result — NAMAT

**Date:** 2026-10-02  
**Branch:** `cursor/phase-0-foundation-8ef0`  
**Operator:** Cursor Cloud Agent (Linux VM — not production, no iPhone)

---

## Changelog (this phase)

1. Audited repository + Cloud Agent host tooling/DNS; documented in `docs/audit/INITIAL_AUDIT.md`.
2. Cloned and audited upstream AirCard-iOS `@6342a345…` (MIT); documented in `docs/audit/AIRCARD_AUDIT.md`.
3. Created isolated `prototypes/wallet-engine/` with `WalletSkinEngine` protocol, stub Apply/Restore round-trip, error codes, adapter sketch.
4. Scaffolded monorepo: `apps/{ios,web,admin}`, `services/api`, `packages/{shared,ui,config}`, `infra/**`, pnpm workspace.
5. Wrote `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, and this result file.
6. Confirmed **no** production DNS/Nginx/service mutations were performed.

---

## Evidence summary

| Deliverable | Status |
|-------------|--------|
| `docs/audit/INITIAL_AUDIT.md` | Done |
| `docs/audit/AIRCARD_AUDIT.md` | Done |
| `prototypes/wallet-engine/` | Done (stub + protocol; no device adapter binary) |
| Monorepo scaffold | Done |
| `docs/ARCHITECTURE.md` | Done |
| `docs/SECURITY.md` | Done |
| Apply + Restore on real supported iPhone | **Not run** — no macOS/Xcode/device |
| Production server Nginx/Docker inventory | **Blocked** — `namat.shara.sa` NXDOMAIN; staging SSH host unknown |
| `swift test` for wallet-engine | **Not run** — Swift toolchain absent on agent |

---

## Critical findings

1. **Restore missing upstream** — AirCard-iOS Apply path exists; Wallet “restore original” must be newly designed (backup-before-apply on device).
2. **Production domain dark** — `namat.shara.sa` does not resolve.
3. **Staging key without host** — Ed25519 key present in agent secrets (`takamul-staging-package-f-temp` comment) but no reachable SSH target identified; live server audit incomplete.
4. **Exploit-based engine** — commercial/legal and fragility risk; isolate behind adapter + remote compatibility kill-switch later.
5. **Local hash logging** — AirCard logs pass hashes in UI; NAMAT must redact before any telemetry.

---

## Conditions / blockers to clear before engine PASS

1. Provide reachable staging/production SSH host (or inventory docs) and complete live-server audit + real rollback file.
2. Provision DNS for `namat.shara.sa` only after (1).
3. Implement on-device original artwork backup + `restoreOriginal` in the AirCard-backed adapter.
4. Build IPA on macOS and verify **Apply + Restore** on a real supported iPhone; attach evidence (screenshots/video + iOS version).
5. Confirm with network capture that no Wallet identifiers leave the device toward NAMAT hosts.
6. Keep AI Skin Studio fully separated from Wallet data (documented; implementation later).

---

## Verdict

**PASS WITH CONDITIONS**

Conditions: items 1–5 in the list above remain open. Per `docs/CODEX_FIRST_TASK.md`, full **PASS** is disallowed until Apply + Restore are verified on a supported real iPhone. Foundation audits, monorepo scaffold, security boundaries, and an isolated engine prototype are in place so Phase 1 abstraction work can proceed **without** claiming device feasibility.
