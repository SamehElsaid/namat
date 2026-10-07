export interface PaymentFactInput {
  status: string;
  amountMinor: number | null;
  expectedAmountMinor: number;
  currency: string | null;
  expectedCurrency: string;
  merchantId: string | null;
  expectedMerchantId: string;
  transactionId: string | null;
  customerReferenceNumber: string | null;
  expectedReference: string;
  terminalId?: string | null;
  expectedTerminalId?: string | null;
}

export function paymentFactsAllowEntitlement(input: PaymentFactInput): {
  ok: boolean;
  reasons: string[];
} {
  if (input.status !== "approved") {
    return { ok: false, reasons: ["status"] };
  }
  const reasons: string[] = [];
  if (!input.transactionId) reasons.push("transaction");
  if (
    input.amountMinor == null ||
    input.amountMinor !== input.expectedAmountMinor
  ) {
    reasons.push("amount");
  }
  if (
    !input.currency ||
    input.currency.toUpperCase() !== input.expectedCurrency.toUpperCase()
  ) {
    reasons.push("currency");
  }
  if (
    input.expectedMerchantId &&
    input.merchantId !== input.expectedMerchantId
  ) {
    reasons.push("merchant");
  }
  if (
    !input.customerReferenceNumber ||
    input.customerReferenceNumber !== input.expectedReference
  ) {
    reasons.push("reference");
  }
  if (
    input.expectedTerminalId &&
    input.terminalId !== input.expectedTerminalId
  ) {
    reasons.push("terminal");
  }
  return { ok: reasons.length === 0, reasons };
}

/** Production must never turn a missing NearPay key into a free entitlement. */
export function allowMockEntitlement(nodeEnv: string | undefined): boolean {
  return (nodeEnv ?? "development") !== "production";
}
