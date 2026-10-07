"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { tr, useAdminLocale } from "@/lib/locale";

type Dash = Awaited<ReturnType<typeof adminApi.dashboard>>;

export default function DashboardPage() {
  const [locale] = useAdminLocale();
  const [data, setData] = useState<Dash | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    void adminApi
      .dashboard(token)
      .then(setData)
      .catch((err) => {
        setError(
          err instanceof AdminApiError
            ? err.message
            : "Dashboard unavailable (API may still be booting).",
        );
      });
  }, []);

  return (
    <AdminShell title="Dashboard">
      {error ? <div className="banner">{error}</div> : null}
      <div className="stats">
        <Stat label={tr(locale, "Customers", "العملاء")} value={data?.customers} />
        <Stat label={tr(locale, "Purchases", "المشتريات")} value={data?.purchases} />
        <Stat label={tr(locale, "Verified paid", "مدفوعات مؤكدة")} value={data?.verifiedPaid} />
        <Stat label={tr(locale, "Test payments", "مدفوعات تجريبية")} value={data?.testPaid} />
        <Stat label={tr(locale, "Refunds", "المستردات")} value={data?.refunds} />
        <Stat label={tr(locale, "Test refunds", "مستردات تجريبية")} value={data?.testRefunds} />
        <Stat label={tr(locale, "Active iPhones", "آيفونات مفعّلة")} value={data?.activeIphones} />
        <Stat
          label={tr(locale, "Checkout", "الشراء")}
          value={
            data
              ? `${data.checkoutAvailable ? "on" : "off"} · ${data.paymentMode}`
              : undefined
          }
        />
      </div>
      <div className="panel muted">
        {tr(
          locale,
          "Counts come from the server. Test payments are separate from verified paid totals. Checkout stays off until the owner enables a ready configuration.",
          "الأرقام من الخادم. المدفوعات التجريبية منفصلة عن المدفوع المؤكد. يبقى الشراء متوقفًا حتى يفعّله المالك بعد اكتمال الإعداد.",
        )}
      </div>
    </AdminShell>
  );
}

function Stat({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value ?? "—"}</div>
    </div>
  );
}
