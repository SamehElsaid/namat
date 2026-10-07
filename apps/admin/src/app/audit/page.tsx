"use client";

import { useEffect, useState } from "react";
import type { AuditLog } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) return;
    void adminApi
      .auditLogs(token)
      .then(setLogs)
      .catch((err) =>
        setError(err instanceof AdminApiError ? err.message : "Load failed"),
      );
  }, []);

  return (
    <AdminShell title="Audit logs">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="When" ar="الوقت" /></th>
              <th><Tx en="Actor" ar="الفاعل" /></th>
              <th><Tx en="Result" ar="النتيجة" /></th>
              <th><Tx en="Action" ar="الإجراء" /></th>
              <th><Tx en="Resource" ar="المورد" /></th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td>{l.createdAt}</td>
                <td>{l.actorEmail ?? "—"}</td>
                <td>{l.result ?? "—"}</td>
                <td>{l.action}</td>
                <td>
                  {l.resourceType ?? "—"}
                  {l.resourceId ? ` / ${l.resourceId}` : ""}
                </td>
              </tr>
            ))}
            {logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No audit entries.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
