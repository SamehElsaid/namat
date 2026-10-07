# Payments

Customer checkout uses a server-created Moyasar Hosted Invoice. The server sets the amount from the selected package snapshot, currency, customer, and purchase. The hosted invoice URL is navigation only. A success or back URL is not payment proof.

## Hosted Invoice flow

1. NAMAT API creates a Moyasar invoice with the **secret key** (`POST /v1/invoices`).
2. The customer pays on Moyasar’s hosted page.
3. Moyasar may notify NAMAT via webhook and/or invoice callback; the customer may return to the site.
4. NAMAT fetches the payment/invoice from Moyasar with the secret key and verifies facts.
5. Production entitlement is granted only after that server-to-server proof.

Publishable keys (`pk_test_` / `pk_live_`) are **not** required for this Hosted Invoice path. Moyasar documents the publishable key for client-side Create Payment / Form / SDK flows. NAMAT still stores an optional publishable key for a future client-side integration; an empty value does not block checkout readiness. If a publishable key is stored, it must match the selected mode.

## Entitlement rules

Entitlement is granted only after the API fetches the payment with the secret key and confirms:

- status `paid`
- amount and currency match the **purchase snapshot** (not the current package price)
- the payment metadata matches the purchase, or the metadata is absent and the fetched invoice id matches the purchase
- the secret key is a live key (`sk_live_`)
- the payment is not flagged `live: false` (webhook envelope)

A test key (`sk_test_`) or a payment flagged `live: false` records `test_paid` and does not grant a production entitlement. Checkout is unavailable until the owner enables it and readiness passes: a valid secret key for the selected mode, webhook secret of at least 16 characters, and an `https://` public origin. The enabled flag cannot bypass those checks.

## Webhooks and invoice callbacks

Invoice callbacks have no documented signature. They are hints only. The API fetches the invoice before changing a purchase.

Webhooks are **fail-closed**: missing or wrong `secret_token` is rejected before any event processing, payment fetch, or purchase transition. Knowing the payment or purchase id is not authentication. After a correct `secret_token`, the payment is fetched again with the secret key. Duplicate event ids are stored and ignored after processing.

## Invoice recovery and refunds

An uncertain invoice response (timeout, 5xx, network error, unparseable body) does not create a second invoice. Recovery lists invoices with `metadata[namat_purchase_id]`, follows `{ invoices, meta }` pages until `meta.next_page` is null, and adopts at most one matching invoice.

Full refunds use `POST /v1/payments/{id}/refund` with an empty body. Entitlement is revoked only after a later fetch shows status `refunded` with `refunded === amount` for the purchase amount. Partial refunds do not revoke entitlement. A mismatched created invoice is cancelled with `PUT /v1/invoices/{id}/cancel`.

## NearPay legacy

Historical NearPay purchases stay on NearPay. Refund or reversal for those rows uses the existing NearPay adjustment path. Pending NearPay rows are not converted to Moyasar. New online customer checkout is Moyasar only.

## Secrets

Secrets live in environment variables or in AES-256-GCM ciphertext encrypted with `PAYMENT_CONFIG_KEY`. That key is not stored in the database. API responses and audit rows contain masked key prefixes only. `PAYMENT_CONFIG_KEY` must be a random secret of at least 32 characters. A 16-character string is rejected. Meeting the length floor is not proof of 256-bit entropy; generate it with `openssl rand -base64 32`.

Do not enable live checkout or place live keys during a code delivery. Apple Pay and STC Pay are not assumed to appear on the hosted invoice.

## Official Moyasar sources

Official Moyasar sources used for this integration, checked against https://docs.moyasar.com/api/api-introduction (reviewed 2026-10-05):

- Create invoice returns one invoice object with `id`, `status`, `amount`, `currency`, `url`, `metadata`, and `payments`. List invoices returns `{ invoices, meta }`, not a bare array and not a `data` wrapper. The metadata filter is `metadata[key]`. Pages are followed until `meta.next_page` is null. An incomplete page does not authorize another invoice.
- Authentication: secret key via HTTP Basic Auth (username = key, empty password). Publishable key is restricted to Create Payment from client code.
- The documented payment webhook names are `payment_paid`, `payment_faild`, `payment_refunded`, `payment_voided`, `payment_authorized`, `payment_captured`, and `payment_verified`. The failure name is `payment_faild`. `payment_failed` is accepted only as an alias. Webhook `secret_token` must match the configured shared secret.
- Fetch Payment does not document a `live` field. The webhook envelope does (`live: boolean`). A webhook with `live: false` is not applied when the configured secret key is live. Test keys record `test_paid`.
- Full refund is `POST /v1/payments/:id/refund` with no body. Cancel invoice is `PUT /v1/invoices/:id/cancel`.

These shapes are from the current official docs. This repository has not called the live Moyasar API.

`NEXT_PUBLIC_PAYMENT_MODE` is not used to grant entitlement or to decide checkout availability.
