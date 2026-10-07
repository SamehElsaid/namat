# NAMAT Web — consumer storefront

Next.js 15 App Router site for namat.shara.sa.

## Scripts

```bash
pnpm --filter @namat/web dev
pnpm --filter @namat/web build
```

## Env

See `.env.example`. Default API: `http://127.0.0.1:3302/api/v1`.

Checkout uses the server Moyasar invoice when the owner has enabled a ready configuration. The page shows الشراء غير متاح حاليًا otherwise. A return URL is not payment proof.
