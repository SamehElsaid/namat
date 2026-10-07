import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { randomUUID } from 'crypto';
import {
  CreatePaymentSessionInput,
  NormalizedWebhookEvent,
  PaymentProvider,
  PaymentSessionResult,
  PaymentSessionStatus,
} from '../payment-provider.interface';
import { StructuredLogger } from '../../../common/logging/logger';

/** Fields that must never be persisted from NearPay payloads. */
const STRIP_KEYS = new Set([
  'pan',
  'pan_suffix',
  'card_expiration',
  'application_cryptogram',
  'payment_account_reference',
  'cryptogram_information_data',
]);

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) {
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

function parseAmountMinor(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) {
    // NearPay webhook amount_authorized.value is decimal SAR string usually
    return Math.round(value * 100);
  }
  if (typeof value === 'string') {
    const n = Number(value);
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100);
  }
  if (typeof value === 'object' && value !== null && 'value' in value) {
    return parseAmountMinor((value as { value: unknown }).value);
  }
  return null;
}

@Injectable()
export class NearPayProvider implements PaymentProvider {
  readonly name = 'nearpay' as const;
  private readonly log = new StructuredLogger('NearPayProvider');
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly webhookSecret: string;
  private readonly mockMode: boolean;

  constructor(private readonly config: ConfigService) {
    this.apiKey = this.config.get<string>('app.nearpayApiKey') ?? '';
    this.baseUrl =
      this.config.get<string>('app.nearpayBaseUrl') ??
      'https://sandbox-api.nearpay.io';
    this.webhookSecret =
      this.config.get<string>('app.nearpayWebhookSecret') ?? '';
    this.mockMode = !this.apiKey;
    if (this.mockMode) {
      this.log.warn(
        'NEARPAY_API_KEY missing — running NearPay sandbox mock mode',
      );
    }
  }

  isMockMode(): boolean {
    return this.mockMode;
  }

  /**
   * Official NearPay customer payment is a SoftPOS terminal purchase, not a
   * browser card redirect. Live mode uses the documented remote HTTP proxy
   * (JWT room, then purchase with customer_reference_number). Missing terminal
   * credentials keep checkout blocked.
   */
  async createSession(
    input: CreatePaymentSessionInput,
  ): Promise<PaymentSessionResult> {
    const jobId = randomUUID();
    if (this.mockMode) {
      return {
        provider: 'nearpay',
        mode: 'mock',
        customerReferenceNumber: input.customerReferenceNumber,
        checkoutReference: `mock_${input.customerReferenceNumber}`,
        amountMinor: input.amountMinor,
        currency: input.currency,
        sandboxBaseUrl: this.baseUrl,
        jobId,
        terminalPurchase: 'mock',
        blockedReason: null,
        transactionId: null,
      };
    }

    const missing = this.missingRemoteCredentials();
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `NearPay remote terminal purchase is not configured. Missing: ${missing.join(', ')}. Checkout stays blocked until those credentials exist. A browser card redirect is not a NearPay customer payment.`,
      );
    }

    const initiated = await this.initiateRemotePurchase({
      amountMinor: input.amountMinor,
      customerReferenceNumber: input.customerReferenceNumber,
      jobId,
    });
    return {
      provider: 'nearpay',
      mode: 'live',
      customerReferenceNumber: input.customerReferenceNumber,
      checkoutReference: `np_${jobId}`,
      amountMinor: input.amountMinor,
      currency: input.currency,
      sandboxBaseUrl: this.baseUrl,
      jobId,
      terminalPurchase: 'initiated',
      blockedReason: null,
      transactionId: initiated.transactionId,
    };
  }

  missingRemoteCredentials(): string[] {
    const missing: string[] = [];
    if (!(this.config.get<string>('app.nearpayTerminalId') ?? '').trim()) {
      missing.push('NEARPAY_TERMINAL_ID');
    }
    if (!(this.config.get<string>('app.nearpayMerchantUuid') ?? '').trim()) {
      missing.push('NEARPAY_MERCHANT_UUID');
    }
    if (!(this.config.get<string>('app.nearpayJwtPrivateKey') ?? '').trim()) {
      missing.push('NEARPAY_JWT_PRIVATE_KEY');
    }
    if (!this.apiKey) missing.push('NEARPAY_API_KEY');
    return missing;
  }

  /**
   * https://docs.nearpay.io/sa/en/remote-integration/proxy-with-http
   * Auth creates a room. Purchase runs on the connected SoftPOS terminal.
   */
  private async initiateRemotePurchase(input: {
    amountMinor: number;
    customerReferenceNumber: string;
    jobId: string;
  }): Promise<{ transactionId: string | null }> {
    const room = await this.openRemoteRoom();
    const purchaseResponse = await fetch(
      `${this.proxyBase()}/${encodeURIComponent(room.roomId)}/purchase`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${room.token}`,
        },
        body: JSON.stringify({
          amount: input.amountMinor,
          jobId: input.jobId,
          customer_reference_number: input.customerReferenceNumber,
        }),
      },
    );
    if (!purchaseResponse.ok) {
      throw new ServiceUnavailableException(
        `NearPay remote purchase failed (HTTP ${purchaseResponse.status}).`,
      );
    }
    const raw = (await purchaseResponse.json()) as Record<string, unknown>;
    this.stripCardFields(raw);
    const receipts = Array.isArray(raw.transactionReceipts)
      ? (raw.transactionReceipts as Record<string, unknown>[])
      : [];
    for (const receipt of receipts) this.stripCardFields(receipt);
    const receipt = receipts[0];
    const reference = receipt?.customer_reference_number;
    if (
      typeof reference === 'string' &&
      reference.length > 0 &&
      reference !== input.customerReferenceNumber
    ) {
      throw new ServiceUnavailableException(
        'NearPay purchase reference did not match the NAMAT purchase.',
      );
    }
    const transactionId =
      typeof receipt?.transaction_uuid === 'string'
        ? receipt.transaction_uuid
        : null;
    this.log.info('NearPay remote purchase initiated', {
      jobId: input.jobId,
      hasTransaction: Boolean(transactionId),
    });
    return { transactionId };
  }

  /**
   * Official remote proxy refund/reverse. Mock mode and missing terminal
   * credentials fail closed and do not change entitlement.
   * https://docs.nearpay.io/sa/en/remote-integration/proxy-with-http
   */
  async requestAdjustment(input: {
    action: 'refund' | 'reverse';
    transactionId: string;
    amountMinor: number;
    customerReferenceNumber: string;
  }): Promise<void> {
    if (this.mockMode) {
      throw new ServiceUnavailableException(
        'NearPay mock mode cannot refund or reverse a payment. No entitlement is granted or changed.',
      );
    }
    const missing = this.missingRemoteCredentials();
    if (missing.length > 0) {
      throw new ServiceUnavailableException(
        `NearPay ${input.action} is not configured. Missing: ${missing.join(', ')}.`,
      );
    }
    const room = await this.openRemoteRoom();
    const jobId = randomUUID();
    const response = await fetch(
      `${this.proxyBase()}/${encodeURIComponent(room.roomId)}/${input.action}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          Authorization: `Bearer ${room.token}`,
        },
        body: JSON.stringify({
          amount: input.amountMinor,
          transaction_uuid: input.transactionId,
          customer_reference_number: input.customerReferenceNumber,
          jobId,
        }),
      },
    );
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `NearPay ${input.action} failed (HTTP ${response.status}). Entitlement was not changed.`,
      );
    }
    const raw = (await response.json()) as Record<string, unknown>;
    this.stripCardFields(raw);
  }

  private async openRemoteRoom(): Promise<{ roomId: string; token: string }> {
    const jwt = this.signTerminalJwt();
    const authResponse = await fetch(`${this.proxyBase()}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jwt }),
    });
    if (!authResponse.ok) {
      throw new ServiceUnavailableException(
        `NearPay remote auth failed (HTTP ${authResponse.status}). The terminal must be in remote mode.`,
      );
    }
    const auth = (await authResponse.json()) as {
      room_id?: string;
      token?: string;
    };
    if (!auth.room_id || !auth.token) {
      throw new ServiceUnavailableException(
        'NearPay remote auth did not return room_id and token.',
      );
    }
    return { roomId: auth.room_id, token: auth.token };
  }

  private proxyBase(): string {
    return `${this.baseUrl.replace(/\/$/, '')}/proxy/operations`;
  }

  private signTerminalJwt(): string {
    const terminalId = this.config.get<string>('app.nearpayTerminalId') ?? '';
    const merchantUuid =
      this.config.get<string>('app.nearpayMerchantUuid') ?? '';
    const privateKey =
      this.config.get<string>('app.nearpayJwtPrivateKey') ?? '';
    const header = Buffer.from(
      JSON.stringify({ alg: 'RS256', typ: 'JWT' }),
    ).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({
        data: {
          ops: 'auth',
          merchant_uuid: merchantUuid,
          terminal_id: terminalId,
        },
      }),
    ).toString('base64url');
    const data = `${header}.${body}`;
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(data), privateKey)
      .toString('base64url');
    return `${data}.${signature}`;
  }

  private stripCardFields(record: Record<string, unknown>) {
    for (const key of STRIP_KEYS) {
      if (key in record) delete record[key];
    }
  }

  /**
   * NearPay's published webhook reference does not document a signature.
   * This check is a NAMAT operator control, not an official NearPay scheme:
   * when NEARPAY_WEBHOOK_SECRET is set, require that shared secret as
   * `Authorization: Bearer <secret>` or `api-key`. Live entitlement grants
   * still require a successful POS API transaction lookup.
   */
  verifyWebhookSignature(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean {
    if (!this.webhookSecret) {
      const nodeEnv = this.config.get<string>('app.nodeEnv') ?? 'development';
      return nodeEnv !== 'production';
    }
    const auth = headerValue(headers, 'authorization');
    const apiKey = headerValue(headers, 'api-key');
    const presented = auth?.startsWith('Bearer ')
      ? auth.slice('Bearer '.length)
      : apiKey;
    if (!presented) return false;
    const a = Buffer.from(presented);
    const b = Buffer.from(this.webhookSecret);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  /**
   * Authoritative lookup via documented POS API GET /transactions/{id}.
   * The response may contain PAN; only safe fields are returned.
   */
  async fetchAuthoritativeTransaction(transactionId: string): Promise<{
    approved: boolean;
    reversed: boolean;
    refunded: boolean;
    amountMinor: number | null;
    currency: string | null;
    merchantId: string | null;
    terminalId: string | null;
    customerReferenceNumber: string | null;
    transactionId: string;
    jobId: string | null;
  } | null> {
    if (this.mockMode || !transactionId) return null;
    const response = await this.apiFetch(
      `/v1/clients-sdk/pos/transactions/${encodeURIComponent(transactionId)}`,
    );
    if (!response.ok) return null;
    const raw = (await response.json()) as Record<string, unknown>;
    const tx = (raw.transaction ?? raw) as Record<string, unknown>;
    delete tx.pan;
    delete tx.card_expiration;
    delete tx.application_cryptogram;
    delete tx.payment_account_reference;
    const amountRaw = tx.amount_authorized;
    let amountMinor: number | null = null;
    if (typeof amountRaw === 'string' && amountRaw.includes('.')) {
      amountMinor = Math.round(Number(amountRaw) * 100);
    } else if (typeof amountRaw === 'string' || typeof amountRaw === 'number') {
      const n = Number(amountRaw);
      amountMinor = Number.isFinite(n) ? Math.round(n) : null;
    }
    const currencyCode = String(tx.currency_code ?? '');
    const currency =
      currencyCode === '682' || currencyCode === '' ? 'SAR' : currencyCode;
    const terminal = tx.terminal as { id?: string; card_acceptor_terminal_id?: string } | undefined;
    const reference = tx.customer_reference_number;
    return {
      approved: Boolean(tx.is_approved) && !tx.is_reversed && !tx.is_refunded,
      reversed: Boolean(tx.is_reversed),
      refunded: Boolean(tx.is_refunded),
      amountMinor,
      currency: currency === 'SAR' || currency.length === 3 ? currency : null,
      merchantId: (tx.merchant_id as string) ?? null,
      terminalId: terminal?.id ?? terminal?.card_acceptor_terminal_id ?? null,
      customerReferenceNumber:
        typeof reference === 'string' && reference.length > 0 ? reference : null,
      transactionId,
      jobId: typeof tx.job_id === 'string' ? tx.job_id : null,
    };
  }

  async normalizeWebhook(
    rawBody: unknown,
    _headers: Record<string, string | string[] | undefined>,
  ): Promise<NormalizedWebhookEvent> {
    const root = (rawBody ?? {}) as Record<string, unknown>;
    const payload = (root.payload ?? root) as Record<string, unknown>;

    // Explicitly drop sensitive keys if present (masked PAN etc.)
    for (const key of STRIP_KEYS) {
      if (key in payload) {
        delete payload[key];
      }
    }

    const isApproved = Boolean(payload.is_approved);
    const isRefunded = Boolean(payload.is_refunded);
    const isReversed = Boolean(payload.is_reversed);

    let eventType: NormalizedWebhookEvent['eventType'] = 'unknown';
    let status: PaymentSessionStatus = 'pending';

    if (isReversed) {
      eventType = 'reversed';
      status = 'reversed';
    } else if (isApproved && isRefunded) {
      eventType = 'approved';
      status = 'refunded';
    } else if (isApproved) {
      eventType = 'approved';
      status = 'approved';
    } else if (payload.is_approved === false) {
      eventType = 'rejected';
      status = 'rejected';
    } else if (typeof root.event === 'string') {
      const ev = root.event.toLowerCase();
      if (ev.includes('approved')) {
        eventType = 'approved';
        status = 'approved';
      } else if (ev.includes('rejected') || ev.includes('declined')) {
        eventType = 'rejected';
        status = 'rejected';
      } else if (ev.includes('reversed')) {
        eventType = 'reversed';
        status = 'reversed';
      }
    }

    const transaction =
      (payload.transaction as Record<string, unknown> | undefined) ?? {};
    const transactionId =
      (payload.transaction_uuid as string) ||
      (payload.id as string) ||
      null;
    const customerReferenceNumber =
      (payload.customer_reference_number as string) ||
      (transaction.customer_reference_number as string) ||
      (root.customer_reference_number as string) ||
      null;

    const amountMinor = parseAmountMinor(payload.amount_authorized);
    const currencyObj = payload.currency as
      | { english?: string }
      | string
      | undefined;
    const currency =
      typeof currencyObj === 'string'
        ? currencyObj
        : currencyObj?.english ?? null;

    const providerEventKey = [
      eventType,
      transactionId ?? 'none',
      customerReferenceNumber ?? 'none',
      status,
    ].join(':');

    return {
      providerEventKey,
      eventType,
      transactionId,
      customerReferenceNumber,
      status,
      amountMinor,
      currency,
      merchantId: (payload.merchant_id as string) ?? null,
      terminalId: (payload.terminal_id as string) ?? null,
      retrievalReferenceNumber:
        (payload.retrieval_reference_number as string) ?? null,
    };
  }

  /** Outbound authenticated fetch helper for future NearPay REST calls. */
  async apiFetch(pathname: string, init: RequestInit = {}): Promise<Response> {
    if (this.mockMode) {
      throw new Error('NearPay mock mode — outbound API disabled');
    }
    const url = `${this.baseUrl.replace(/\/$/, '')}${pathname}`;
    const headers = new Headers(init.headers);
    headers.set('api-key', this.apiKey);
    headers.set('Accept', 'application/json');
    return fetch(url, { ...init, headers });
  }
}
