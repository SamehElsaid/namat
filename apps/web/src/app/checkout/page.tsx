"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { NAMAT_PRICE_SAR } from "@namat/shared";
import { Button } from "@namat/ui";
import { ApiError, api, type CheckoutAvailability } from "@/lib/api";
import { getStoredToken } from "@/lib/session";
import { useTx } from "@/components/Copy";

const UNAVAILABLE = "الشراء غير متاح حاليًا";

export default function CheckoutPage() {
  const tx = useTx();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [availability, setAvailability] = useState<CheckoutAvailability | null>(null);
  const [packageCode, setPackageCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("package");
    setPackageCode(requested);
    void (async () => {
      try {
        setAvailability(await api.checkoutAvailability(requested ?? undefined));
      } catch {
        setAvailability({
          available: false,
          message: UNAVAILABLE,
          priceMinor: NAMAT_PRICE_SAR * 100,
          currency: "SAR",
          test: false,
        });
      }
      if (token) {
        try {
          await api.me(token);
          setSignedIn(true);
        } catch {
          setSignedIn(false);
        }
      }
      setReady(true);
    })();
  }, []);

  async function pay(event: FormEvent) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const session = await api.createCheckoutSession(
        token,
        availability?.packageCode ?? packageCode ?? undefined,
      );
      if (session.invoiceUrl) {
        window.location.assign(session.invoiceUrl);
        return;
      }
      window.location.assign(`/checkout/return?purchaseId=${encodeURIComponent(session.purchaseId)}`);
    } catch (err) {
      setError(customerCheckoutError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  const unavailable = !availability?.available;

  return (
    <div className="container auth-page">
      <header className="page-hero">
        <h1>{tx("Checkout", "الدفع")}</h1>
        <p>
          {tx(
            `${NAMAT_PRICE_SAR} SAR one-time. Lifetime access on one iPhone.`,
            `${NAMAT_PRICE_SAR} ريال. شراء لمرة واحدة. صلاحية دائمة على آيفون واحد.`,
          )}
        </p>
      </header>

      {!ready ? <p>{tx("Loading…", "جارٍ التحميل…")}</p> : null}

      {ready && unavailable ? (
        <div className="notice warn" role="status">
          {UNAVAILABLE}
        </div>
      ) : null}

      {ready && !unavailable && availability?.test ? (
        <div className="notice warn" style={{ maxWidth: "32rem", marginBottom: "1.25rem" }}>
          {tx(
            "This is a test checkout. It does not activate NAMAT.",
            "هذا دفع تجريبي. لا يفعّل نَمَط.",
          )}
        </div>
      ) : null}

      {ready && !unavailable && !signedIn ? (
        <div className="form-panel">
          <p>{tx("Sign in to continue.", "سجّل الدخول للمتابعة.")}</p>
          <Link href="/login?next=/checkout">
            <Button size="lg">{tx("Sign in", "تسجيل الدخول")}</Button>
          </Link>
        </div>
      ) : null}

      {ready && !unavailable && signedIn ? (
        <form className="form-panel" onSubmit={pay}>
          <p>
            {tx("Price", "السعر")} {(availability.priceMinor / 100).toFixed(2)} {availability.currency}
          </p>
          {error ? (
            <div className="notice" role="alert">
              {error}
            </div>
          ) : null}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? tx("Working…", "جارٍ العمل…") : tx("Pay", "ادفع")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function customerCheckoutError(err: unknown, tx: (en: string, ar: string) => string): string {
  if (err instanceof ApiError && err.body && typeof err.body === "object" && "error" in err.body) {
    const code = (err.body as { error?: string }).error;
    if (code === "checkout_unavailable") return UNAVAILABLE;
    if (code === "entitlement_active") {
      return tx("NAMAT is already active on this account.", "نَمَط مفعّل على هذا الحساب.");
    }
  }
  return tx("Payment could not be started.", "تعذر بدء الدفع.");
}
