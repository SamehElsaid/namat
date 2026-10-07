"use client";

import { useEffect, useState } from "react";
import { Button } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { tr, useAdminLocale } from "@/lib/locale";
import { getAdminToken } from "@/lib/session";

type PurchaseRow = Awaited<ReturnType<typeof adminApi.purchases>>[number];

export default function PaymentsPage() {
  const [locale] = useAdminLocale();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setRows(await adminApi.purchases(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(id: string, action: "refund" | "reverse") {
    const token = getAdminToken();
    if (!token) return;
    const reason = window.prompt(
      action === "refund" ? "Reason for the full refund" : "Reason for the historical reversal",
    );
    if (!reason || reason.trim().length < 3) return;
    if (!window.confirm(action === "refund" ? "Confirm a full refund?" : "Confirm this reversal?")) return;
    setNotice(null);
    setError(null);
    try {
      const result =
        action === "refund"
          ? await adminApi.refundPurchase(token, id, reason.trim())
          : await adminApi.reversePurchase(token, id, reason.trim());
      setNotice(
        result.confirmed
          ? tr(
              locale,
              `Confirmed ${result.status}.`,
              `تم تأكيد الحالة: ${result.status}.`,
            )
          : tr(
              locale,
              "The provider did not confirm the refund. The entitlement was not changed.",
              "لم يؤكد مزود الدفع الاسترداد. لم تتغير الصلاحية.",
            ),
      );
      await load();
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : tr(locale, "Request failed.", "فشل الطلب."),
      );
    }
  }

  return (
    <AdminShell title="Payments">
      <p className="muted">
        {tr(
          locale,
          "Full refunds are confirmed with the payment provider before the matching purchase entitlement is revoked. Historical terminal purchases stay on their original provider. Test payments are labeled and do not count as live revenue.",
          "الاسترداد الكامل يُؤكد لدى مزود الدفع قبل إلغاء صلاحية الشراء المطابق فقط. مشتريات الجهاز الطرفي التاريخية تبقى لدى مزودها. المدفوعات التجريبية معلّمة ولا تُحسب كإيراد فعلي.",
        )}
      </p>
      {error ? <div className="banner danger">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr(locale, "Reference", "المرجع")}</th>
              <th>{tr(locale, "Status", "الحالة")}</th>
              <th>{tr(locale, "Amount", "المبلغ")}</th>
              <th>{tr(locale, "Mode", "الوضع")}</th>
              <th>{tr(locale, "Method", "الطريقة")}</th>
              <th>{tr(locale, "Actions", "إجراءات")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.customerReferenceNumber}</td>
                <td>{row.status}</td>
                <td>
                  {(row.amountMinor / 100).toFixed(2)} {row.currency}
                </td>
                <td>{row.providerMode ?? (row.provider === "nearpay" ? "historical" : "—")}</td>
                <td>
                  {row.paymentMethodBrand || row.paymentMethodType || (row.provider === "nearpay" ? "terminal" : "—")}
                  {row.paymentMethodLast4 ? ` · ${row.paymentMethodLast4}` : ""}
                </td>
                <td>
                  <Button size="sm" variant="secondary" onClick={() => void act(row.id, "refund")}>
                    {tr(locale, "Refund", "استرداد")}
                  </Button>{" "}
                  <Button size="sm" variant="secondary" onClick={() => void act(row.id, "reverse")}>
                    {tr(locale, "Reverse", "عكس")}
                  </Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {tr(locale, "No payments.", "لا توجد مدفوعات.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
