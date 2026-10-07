"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Button } from "@namat/ui";
import { api, type CustomerPurchase } from "@/lib/api";
import { getStoredToken } from "@/lib/session";
import { useTx } from "@/components/Copy";

export default function CheckoutReturnPage() {
  const tx = useTx();
  return (
    <Suspense fallback={<div className="container"><p>{tx("Checking payment…", "جارٍ التحقق من الدفع…")}</p></div>}>
      <ReturnStatus />
    </Suspense>
  );
}

function ReturnStatus() {
  const tx = useTx();
  const params = useSearchParams();
  const purchaseId = params.get("purchaseId");
  const [purchase, setPurchase] = useState<CustomerPurchase | null>(null);
  const [phase, setPhase] = useState<"loading" | "ready" | "unknown">("loading");

  useEffect(() => {
    const token = getStoredToken();
    if (!token || !purchaseId) {
      setPhase("unknown");
      return;
    }
    void api
      .checkoutPurchase(token, purchaseId)
      .then((row) => {
        setPurchase(row);
        setPhase("ready");
      })
      .catch(() => setPhase("unknown"));
  }, [purchaseId]);

  const title = titleFor(purchase, phase, tx);

  return (
    <div className="container">
      <header className="page-hero">
        <h1>{title}</h1>
        <p>
          {tx(
            "This page shows the payment only after the server verifies it.",
            "تعرض هذه الصفحة حالة الدفع بعد تحقق الخادم فقط.",
          )}
        </p>
      </header>
      {purchase?.test ? (
        <div className="notice warn" style={{ maxWidth: "36rem", marginBottom: "1rem" }}>
          {tx("This was a test payment. NAMAT was not activated.", "هذا دفع تجريبي. لم يتم تفعيل نَمَط.")}
        </div>
      ) : null}
      {purchase ? (
        <div className="notice" style={{ maxWidth: "36rem", marginBottom: "1.5rem" }}>
          {purchase.reference} · {(purchase.amountMinor / 100).toFixed(2)} {purchase.currency}
        </div>
      ) : null}
      <Link href="/account">
        <Button>{tx("Account", "الحساب")}</Button>
      </Link>
    </div>
  );
}

function titleFor(
  purchase: CustomerPurchase | null,
  phase: "loading" | "ready" | "unknown",
  tx: (en: string, ar: string) => string,
) {
  if (phase === "loading") return tx("Checking payment…", "جارٍ التحقق من الدفع…");
  if (!purchase || phase === "unknown") {
    return tx("Payment is not confirmed", "لم يتم تأكيد الدفع");
  }
  if (purchase.status === "completed" && purchase.test) return tx("Test payment recorded", "سُجّل دفع تجريبي");
  if (purchase.status === "completed") return tx("Payment confirmed", "تم تأكيد الدفع");
  if (purchase.status === "failed") return tx("Payment failed", "فشل الدفع");
  if (purchase.status === "cancelled") return tx("Payment cancelled", "أُلغي الدفع");
  if (purchase.status === "refunded") return tx("Payment refunded", "تم استرداد الدفع");
  return tx("Payment pending", "الدفع معلّق");
}
