"use client";

import { useEffect, useState } from "react";
import type { AnalyticsEvent } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function AnalyticsPage() {
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    void adminApi
      .analytics(token)
      .then(setEvents)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Load failed"),
      );
  }, []);

  return (
    <AdminShell title="Analytics">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="banner">
        Events are non-sensitive only — no Wallet identifiers or card secrets.
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="When" ar="الوقت" /></th>
              <th><Tx en="Name" ar="الاسم" /></th>
              <th><Tx en="Properties" ar="الخصائص" /></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{e.createdAt}</td>
                <td>{e.name}</td>
                <td>
                  <code style={{ fontSize: "0.8rem" }}>
                    {JSON.stringify(e.properties ?? {})}
                  </code>
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No events.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
