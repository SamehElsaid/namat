import { NAMAT_CURRENCY, NAMAT_PRICE_MINOR } from '@namat/shared';
import { readMoyasarPayment, MoyasarPaymentView } from './moyasar-facts';

export type MoyasarCallResult<T> =
  | { ok: true; value: T }
  | { ok: false; uncertain: boolean; status: number | null };

export interface MoyasarInvoice {
  id: string;
  status: string;
  url: string;
  amount: number;
  currency: string;
  metadataPurchaseId: string | null;
  payments: MoyasarPaymentView[];
}

export interface MoyasarInvoicePage {
  invoices: MoyasarInvoice[];
  complete: boolean;
}

export class MoyasarClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly baseUrl = 'https://api.moyasar.com/v1',
  ) {}

  createInvoice(secretKey: string, input: {
    purchaseId: string;
    callbackUrl: string;
    successUrl: string;
    backUrl: string;
    expiredAt: string;
    /** Bound to the selected package price; falls back to the legacy single product. */
    amountMinor?: number;
    currency?: string;
    description?: string;
  }): Promise<MoyasarCallResult<MoyasarInvoice>> {
    return this.request(secretKey, '/invoices', {
      method: 'POST',
      body: {
        amount: input.amountMinor ?? NAMAT_PRICE_MINOR,
        currency: (input.currency ?? NAMAT_CURRENCY).toUpperCase(),
        description: input.description ?? 'NAMAT lifetime',
        callback_url: input.callbackUrl,
        success_url: input.successUrl,
        back_url: input.backUrl,
        expired_at: input.expiredAt,
        metadata: { namat_purchase_id: input.purchaseId },
      },
    }, (body) => this.readInvoice(body));
  }

  fetchInvoice(secretKey: string, invoiceId: string): Promise<MoyasarCallResult<MoyasarInvoice>> {
    return this.request(secretKey, `/invoices/${encodeURIComponent(invoiceId)}`, { method: 'GET' }, (body) =>
      this.readInvoice(body),
    );
  }

  fetchPayment(secretKey: string, paymentId: string): Promise<MoyasarCallResult<MoyasarPaymentView>> {
    return this.request(secretKey, `/payments/${encodeURIComponent(paymentId)}`, { method: 'GET' }, (body) =>
      readMoyasarPayment(body),
    );
  }

  /**
   * Full refund. The body is omitted on purpose: Moyasar treats an amount as a partial refund.
   */
  refundPayment(secretKey: string, paymentId: string): Promise<MoyasarCallResult<MoyasarPaymentView>> {
    return this.request(
      secretKey,
      `/payments/${encodeURIComponent(paymentId)}/refund`,
      { method: 'POST' },
      (body) => readMoyasarPayment(body),
    );
  }

  /**
   * PUT /v1/invoices/:id/cancel. Used when a created invoice does not match the fixed price.
   */
  cancelInvoice(secretKey: string, invoiceId: string): Promise<MoyasarCallResult<true>> {
    return this.request(
      secretKey,
      `/invoices/${encodeURIComponent(invoiceId)}/cancel`,
      { method: 'PUT' },
      () => true,
    );
  }

  /**
   * Official list shape is `{ invoices, meta }`.
   * A bare array or a `data` wrapper is rejected so recovery does not adopt the wrong page.
   * `metadata[namat_purchase_id]` is the documented metadata filter.
   */
  async listInvoicesByPurchase(secretKey: string, purchaseId: string): Promise<MoyasarCallResult<MoyasarInvoicePage>> {
    const invoices: MoyasarInvoice[] = [];
    let page = 1;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const query = new URLSearchParams({
        'metadata[namat_purchase_id]': purchaseId,
        page: String(page),
      });
      const result = await this.request(
        secretKey,
        `/invoices?${query.toString()}`,
        { method: 'GET' },
        (body) => this.readInvoicePage(body),
      );
      if (!result.ok) return result;
      invoices.push(...result.value.invoices);
      if (result.value.nextPage == null) return { ok: true, value: { invoices, complete: true } };
      if (result.value.nextPage === page) return { ok: true, value: { invoices, complete: false } };
      page = result.value.nextPage;
    }
    return { ok: true, value: { invoices, complete: false } };
  }

  private readInvoice(body: unknown): MoyasarInvoice | null {
    if (!body || typeof body !== 'object') return null;
    const row = body as Record<string, unknown>;
    if (typeof row.id !== 'string' || typeof row.status !== 'string' || typeof row.url !== 'string') {
      return null;
    }
    if (typeof row.amount !== 'number' || typeof row.currency !== 'string') return null;
    const payments = Array.isArray(row.payments)
      ? row.payments
          .map((payment) => readMoyasarPayment(payment))
          .filter((payment): payment is MoyasarPaymentView => payment != null)
      : [];
    const metadata = row.metadata && typeof row.metadata === 'object'
      ? (row.metadata as Record<string, unknown>)
      : {};
    return {
      id: row.id,
      status: row.status,
      url: row.url,
      amount: row.amount,
      currency: row.currency,
      metadataPurchaseId: typeof metadata.namat_purchase_id === 'string' ? metadata.namat_purchase_id : null,
      payments,
    };
  }

  private readInvoicePage(body: unknown): { invoices: MoyasarInvoice[]; nextPage: number | null } | null {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    const record = body as { invoices?: unknown; meta?: unknown };
    if (!Array.isArray(record.invoices) || !record.meta || typeof record.meta !== 'object') return null;
    const parsed: MoyasarInvoice[] = [];
    for (const row of record.invoices) {
      const invoice = this.readInvoice(row);
      if (!invoice) return null;
      parsed.push(invoice);
    }
    const next = (record.meta as { next_page?: unknown }).next_page;
    return { invoices: parsed, nextPage: typeof next === 'number' ? next : null };
  }

  private async request<T>(
    secretKey: string,
    path: string,
    init: { method: string; body?: unknown },
    parse: (body: unknown) => T | null,
  ): Promise<MoyasarCallResult<T>> {
    const auth = Buffer.from(`${secretKey}:`).toString('base64');
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: init.method,
        headers: {
          Authorization: `Basic ${auth}`,
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body ? JSON.stringify(init.body) : undefined,
      });
      const text = await response.text();
      let json: unknown = null;
      if (text) {
        try {
          json = JSON.parse(text);
        } catch {
          json = null;
        }
      }
      if (response.status >= 500 || response.status === 408 || response.status === 429) {
        return { ok: false, uncertain: true, status: response.status };
      }
      if (!response.ok) {
        return { ok: false, uncertain: false, status: response.status };
      }
      const value = parse(json);
      if (!value) return { ok: false, uncertain: true, status: response.status };
      return { ok: true, value };
    } catch {
      return { ok: false, uncertain: true, status: null };
    }
  }
}
