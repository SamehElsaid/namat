/**
 * Payment provider abstraction. NearPay is the mandatory adapter.
 * Never store or accept PAN/CVV/PIN through this interface.
 */

export type PaymentSessionStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'reversed'
  | 'refunded';

export interface CreatePaymentSessionInput {
  customerReferenceNumber: string;
  amountMinor: number;
  currency: string;
  metadata?: Record<string, string>;
}

export interface PaymentSessionResult {
  provider: 'nearpay';
  mode: 'live' | 'mock';
  customerReferenceNumber: string;
  /** Opaque checkout / intent reference for the client. */
  checkoutReference: string;
  amountMinor: number;
  currency: string;
  /** Hint for clients (sandbox URL or mock). */
  sandboxBaseUrl: string;
  jobId?: string | null;
  terminalPurchase?: 'mock' | 'initiated' | 'blocked';
  blockedReason?: string | null;
  transactionId?: string | null;
}

export interface NormalizedWebhookEvent {
  providerEventKey: string;
  eventType: 'approved' | 'rejected' | 'reversed' | 'unknown';
  transactionId: string | null;
  customerReferenceNumber: string | null;
  status: PaymentSessionStatus;
  amountMinor: number | null;
  currency: string | null;
  merchantId: string | null;
  terminalId: string | null;
  retrievalReferenceNumber: string | null;
}

export interface PaymentProvider {
  readonly name: 'nearpay';
  createSession(input: CreatePaymentSessionInput): Promise<PaymentSessionResult>;
  normalizeWebhook(
    rawBody: unknown,
    headers: Record<string, string | string[] | undefined>,
  ): Promise<NormalizedWebhookEvent>;
  verifyWebhookSignature?(
    rawBody: Buffer | string,
    headers: Record<string, string | string[] | undefined>,
  ): boolean;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
