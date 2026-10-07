"use client";

import { FormEvent, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button, Input } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";

type Detail = Awaited<ReturnType<typeof adminApi.customer>>;

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setDetail(await adminApi.customer(token, params.id));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, [params.id]);

  async function addNote(event: FormEvent) {
    event.preventDefault();
    const token = getAdminToken();
    if (!token || note.trim().length < 3) return;
    try {
      await adminApi.createSupportNote(token, { userId: params.id, body: note.trim() });
      setNote("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Note failed");
    }
  }

  return (
    <AdminShell title="Customer">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p>{detail?.customer.email}</p>
        <p>
          Entitlement: {detail?.customer.entitlement?.status ?? "none"}
          {detail?.customer.entitlement?.grantSource ? ` · ${detail.customer.entitlement.grantSource}` : ""}
        </p>
      </div>
      <div className="panel table-wrap" style={{ marginBottom: "1rem" }}>
        <h2>Purchases</h2>
        <table>
          <thead>
            <tr><th>Reference</th><th>Date</th><th>Amount</th><th>Mode</th><th>Status</th><th>Method</th></tr>
          </thead>
          <tbody>
            {(detail?.purchases ?? []).map((row) => (
              <tr key={row.id}>
                <td>{row.reference}</td>
                <td>{String(row.createdAt).slice(0, 10)}</td>
                <td>{(row.amountMinor / 100).toFixed(2)} {row.currency}</td>
                <td>{row.mode ?? row.provider}</td>
                <td>{row.status}</td>
                <td>{row.brand || row.method || "—"}{row.last4 ? ` · ${row.last4}` : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <h2>Devices</h2>
        {(detail?.devices ?? []).map((device) => (
          <p key={device.id}>{device.label || "iPhone"} · {device.status} · {device.iosVersion ?? "—"}</p>
        ))}
      </div>
      <div className="panel">
        <h2>Support notes</h2>
        <p className="muted">Notes are recorded by staff. Customers do not submit tickets here.</p>
        {(detail?.notes ?? []).map((item) => (
          <p key={item.id}>{item.createdAt} · {item.actorEmail ?? "—"} · {item.status} · {item.body}</p>
        ))}
        <form className="form-row" onSubmit={addNote}>
          <Input label="Note" value={note} onChange={(e) => setNote(e.target.value)} />
          <Button type="submit">Add note</Button>
        </form>
      </div>
    </AdminShell>
  );
}
