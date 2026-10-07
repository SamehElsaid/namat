"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { tr, useAdminLocale } from "@/lib/locale";
import { getAdminToken } from "@/lib/session";

type SystemStatus = Awaited<ReturnType<typeof adminApi.system>>;

export default function SystemPage() {
  const [locale] = useAdminLocale();
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    void adminApi
      .system(token)
      .then(setStatus)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Load failed"),
      );
  }, []);

  const rows: Array<[string, string]> = status
    ? [
        [tr(locale, "Environment", "البيئة"), status.nodeEnv],
        [
          tr(locale, "NearPay configured", "NearPay مُعد"),
          status.nearpayConfigured
            ? tr(locale, "yes", "نعم")
            : tr(locale, "no — checkout fail-closed", "لا — الدفع يفشل بشكل مغلق"),
        ],
        [
          tr(locale, "Mock entitlement", "استحقاق وهمي"),
          status.mockEntitlementAllowed
            ? tr(locale, "allowed in this environment", "مسموح في هذه البيئة")
            : tr(locale, "blocked", "محظور"),
        ],
        [
          tr(locale, "SMTP", "البريد"),
          status.smtpConfigured
            ? tr(locale, "configured", "مُعد")
            : tr(locale, "unavailable — codes are not sent", "غير متاح — لا تُرسل الرموز"),
        ],
        [
          tr(locale, "AI provider", "مزود الذكاء"),
          status.aiConfigured
            ? tr(locale, "live key present", "مفتاح حي موجود")
            : tr(locale, "unavailable in production", "غير متاح في الإنتاج"),
        ],
        [
          tr(locale, "Owner bootstrap", "تهيئة المالك"),
          status.ownerBootstrapConfigured
            ? tr(locale, "configured", "مُعد")
            : tr(locale, "not set", "غير مضبوط"),
        ],
      ]
    : [];

  return (
    <AdminShell title="System status">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel table-wrap">
        <table>
          <tbody>
            {rows.map(([label, value]) => (
              <tr key={label}>
                <th>{label}</th>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
