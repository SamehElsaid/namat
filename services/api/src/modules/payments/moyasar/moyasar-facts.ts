import { NAMAT_CURRENCY, NAMAT_PRICE_MINOR } from '@namat/shared';

export const CHECKOUT_UNAVAILABLE_AR = 'الشراء غير متاح حاليًا';

export type PaymentMode = 'test' | 'live';

export interface MoyasarPaymentView {
  id: string;
  status: string;
  amount: number;
  currency: string;
  invoiceId: string | null;
  metadataPurchaseId: string | null;
  refunded: number;
  sourceType: string | null;
  brand: string | null;
  last4: string | null;
  /** Provider live flag when present. False never grants production entitlement. */
  live: boolean | null;
}

export function keyMatchesMode(key: string, mode: PaymentMode, kind: 'secret' | 'publishable'): boolean {
  const prefix = kind === 'secret' ? `sk_${mode}_` : `pk_${mode}_`;
  return key.startsWith(prefix) && key.length > prefix.length + 4;
}

/** The key prefix is the environment. A mismatched settings label cannot upgrade a test key. */
export function modeOfSecretKey(secretKey: string): PaymentMode | null {
  if (secretKey.startsWith('sk_live_')) return 'live';
  if (secretKey.startsWith('sk_test_')) return 'test';
  return null;
}

export function maskKey(key: string): string | null {
  const trimmed = key.trim();
  if (!trimmed) return null;
  const prefix = trimmed.slice(0, trimmed.indexOf('_', trimmed.indexOf('_') + 1) + 1);
  const tail = trimmed.slice(-4);
  return `${prefix}…${tail}`;
}

/**
 * Hosted Invoice checkout is created server-side with the secret key
 * (`POST /v1/invoices`). Moyasar's publishable key is only required for
 * client-side Create Payment / Form / SDK flows — not for this path.
 * An empty publishable key therefore does not block readiness. If one is
 * stored, it must still match the selected mode so a mismatched pair is
 * visible in admin before a future client-side flow is enabled.
 */
export function checkoutReadiness(input: {
  mode: PaymentMode;
  secretKey: string;
  publishableKey: string;
  webhookSecret: string;
  publicBaseUrl: string;
}): { ready: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!keyMatchesMode(input.secretKey, input.mode, 'secret')) reasons.push('secret_key');
  const publishable = input.publishableKey.trim();
  if (publishable.length > 0 && !keyMatchesMode(publishable, input.mode, 'publishable')) {
    reasons.push('publishable_key');
  }
  if (input.webhookSecret.trim().length < 16) reasons.push('webhook_secret');
  if (!input.publicBaseUrl.startsWith('https://')) reasons.push('https_origin');
  return { ready: reasons.length === 0, reasons };
}

/**
 * Production entitlement requires a live paid payment for this purchase.
 * Test mode never qualifies, even when Moyasar reports paid.
 */
export function moyasarPaymentGrantsEntitlement(input: {
  mode: PaymentMode;
  payment: MoyasarPaymentView;
  purchaseId: string;
  invoiceId: string | null;
  /** Expected price for the purchased package. Defaults to the legacy single product. */
  expectedAmountMinor?: number;
  expectedCurrency?: string;
}): { ok: boolean; reasons: string[] } {
  const expectedAmount = input.expectedAmountMinor ?? NAMAT_PRICE_MINOR;
  const expectedCurrency = (input.expectedCurrency ?? NAMAT_CURRENCY).toUpperCase();
  const reasons: string[] = [];
  if (input.mode !== 'live' || input.payment.live === false) reasons.push('mode');
  if (input.payment.status !== 'paid') reasons.push('status');
  if (input.payment.amount !== expectedAmount) reasons.push('amount');
  if (input.payment.currency.toUpperCase() !== expectedCurrency) reasons.push('currency');
  const metadataMatch = input.payment.metadataPurchaseId === input.purchaseId;
  const invoiceMatch = Boolean(
    input.invoiceId && input.payment.invoiceId && input.payment.invoiceId === input.invoiceId,
  );
  if (input.payment.metadataPurchaseId && !metadataMatch) reasons.push('purchase');
  if (input.invoiceId && input.payment.invoiceId && !invoiceMatch) reasons.push('invoice');
  if (!metadataMatch && !invoiceMatch) reasons.push('purchase');
  if (!input.payment.id) reasons.push('payment');
  return { ok: reasons.length === 0, reasons };
}

/**
 * Official payment webhook names as of 2026-10-01.
 * The documented failure event is `payment_faild`. `payment_failed` is accepted
 * only as a spelling alias and is not the documented name.
 */
export const MOYASAR_PAYMENT_EVENT_TYPES = [
  'payment_paid',
  'payment_faild',
  'payment_refunded',
  'payment_voided',
  'payment_authorized',
  'payment_captured',
  'payment_verified',
] as const;

export function isMoyasarPaymentEvent(type: unknown): boolean {
  return type === 'payment_failed' || (typeof type === 'string' && (MOYASAR_PAYMENT_EVENT_TYPES as readonly string[]).includes(type));
}

export function fullRefundConfirmed(
  payment: MoyasarPaymentView,
  expectedAmountMinor: number = NAMAT_PRICE_MINOR,
): boolean {
  return (
    payment.status === 'refunded' &&
    payment.refunded === payment.amount &&
    payment.amount === expectedAmountMinor
  );
}

export function last4OfMasked(number: unknown): string | null {
  if (typeof number !== 'string') return null;
  const digits = number.replace(/\D/g, '');
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export function safeSource(source: unknown): {
  sourceType: string | null;
  brand: string | null;
  last4: string | null;
} {
  if (!source || typeof source !== 'object') {
    return { sourceType: null, brand: null, last4: null };
  }
  const row = source as Record<string, unknown>;
  const sourceType = typeof row.type === 'string' ? row.type.slice(0, 32) : null;
  const brand = typeof row.company === 'string' ? row.company.slice(0, 32) : null;
  return { sourceType, brand, last4: last4OfMasked(row.number) };
}

/** Drop card numbers, tokens, and secrets before any log or audit write. */
export function redactPaymentPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactPaymentPayload);
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const lower = key.toLowerCase();
    if (
      lower.includes('secret') ||
      lower.includes('token') ||
      lower === 'number' ||
      lower === 'cvc' ||
      lower === 'cvv' ||
      lower === 'pan' ||
      lower === 'name' ||
      lower === 'dpan' ||
      lower === 'month' ||
      lower === 'year'
    ) {
      out[key] = '[redacted]';
      continue;
    }
    out[key] = redactPaymentPayload(child);
  }
  return out;
}

export function readMoyasarPayment(body: unknown): MoyasarPaymentView | null {
  if (!body || typeof body !== 'object') return null;
  const row = body as Record<string, unknown>;
  if (typeof row.id !== 'string' || typeof row.status !== 'string') return null;
  if (typeof row.amount !== 'number' || typeof row.currency !== 'string') return null;
  const metadata = row.metadata && typeof row.metadata === 'object'
    ? (row.metadata as Record<string, unknown>)
    : {};
  const source = safeSource(row.source);
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    invoiceId: typeof row.invoice_id === 'string' ? row.invoice_id : null,
    metadataPurchaseId:
      typeof metadata.namat_purchase_id === 'string' ? metadata.namat_purchase_id : null,
    refunded: typeof row.refunded === 'number' ? row.refunded : 0,
    live: typeof row.live === 'boolean' ? row.live : null,
    ...source,
  };
}
