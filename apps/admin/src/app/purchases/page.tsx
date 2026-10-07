"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { tr, useAdminLocale } from "@/lib/locale";
import { getAdminToken } from "@/lib/session";

type PurchaseRow = Awaited<ReturnType<typeof adminApi.purchases>>[number];

export default function PurchasesPage() {
  const [locale] = useAdminLocale();
  const [rows, setRows] = useState<PurchaseRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    void adminApi
      .purchases(token)
      .then(setRows)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Load failed"),
      );
  }, []);

  return (
    <AdminShell title="Purchases">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>{tr(locale, "Reference", "المرجع")}</th>
              <th>{tr(locale, "Status", "الحالة")}</th>
              <th>{tr(locale, "Amount", "المبلغ")}</th>
              <th>{tr(locale, "User", "المستخدم")}</th>
              <th>{tr(locale, "Transaction", "المعاملة")}</th>
              <th>{tr(locale, "Created", "تاريخ الإنشاء")}</th>
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
                <td>{row.userId}</td>
                <td>{row.nearpayTransactionId ?? "—"}</td>
                <td>{row.createdAt}</td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted">
                  {tr(locale, "No purchases.", "لا توجد مشتريات.")}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
