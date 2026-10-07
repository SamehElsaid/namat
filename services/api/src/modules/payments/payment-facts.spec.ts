import {
  allowMockEntitlement,
  paymentFactsAllowEntitlement,
} from "./payment-facts";

const ok = {
  status: "approved",
  amountMinor: 29900,
  expectedAmountMinor: 29900,
  currency: "SAR",
  expectedCurrency: "SAR",
  merchantId: "m1",
  expectedMerchantId: "m1",
  transactionId: "tx-1",
  customerReferenceNumber: "namat_ref",
  expectedReference: "namat_ref",
};

describe("payment facts", () => {
  it("requires amount, currency, merchant, reference, and transaction", () => {
    expect(paymentFactsAllowEntitlement(ok).ok).toBe(true);
    expect(
      paymentFactsAllowEntitlement({ ...ok, amountMinor: 100 }).reasons,
    ).toContain("amount");
    expect(
      paymentFactsAllowEntitlement({ ...ok, currency: "USD" }).reasons,
    ).toContain("currency");
    expect(
      paymentFactsAllowEntitlement({ ...ok, merchantId: "other" }).reasons,
    ).toContain("merchant");
    expect(
      paymentFactsAllowEntitlement({
        ...ok,
        customerReferenceNumber: "nope",
      }).reasons,
    ).toContain("reference");
    expect(
      paymentFactsAllowEntitlement({ ...ok, status: "rejected" }).ok,
    ).toBe(false);
    expect(
      paymentFactsAllowEntitlement({ ...ok, transactionId: null }).reasons,
    ).toContain("transaction");
  });

  it("does not grant mock entitlements in production", () => {
    expect(allowMockEntitlement("production")).toBe(false);
    expect(allowMockEntitlement("development")).toBe(true);
    expect(allowMockEntitlement("test")).toBe(true);
  });
});