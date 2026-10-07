"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";

type Row = Awaited<ReturnType<typeof adminApi.customers>>["customers"][number];

export default function CustomersPage() {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load(nextPage = page, nextQuery = query) {
    const token = getAdminToken();
    if (!token) return;
    try {
      const result = await adminApi.customers(token, nextQuery, nextPage);
      setRows(result.customers);
      setTotal(result.total);
      setPage(result.page);
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load(1, "");
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    void load(1, query);
  }

  return (
    <AdminShell title="Customers">
      {error ? <div className="banner danger">{error}</div> : null}
      <form className="panel form-row" onSubmit={search} style={{ marginBottom: "1rem" }}>
        <Input label="Search email" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Entitlement</th>
              <th>Source</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{row.entitlement?.status === "active" ? row.entitlement.plan : row.entitlement?.status ?? "none"}</td>
                <td>{row.entitlement?.grantSource ?? "—"}</td>
                <td><Link href={`/customers/${row.id}`}>Details</Link></td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="muted">No customers.</td></tr>
            ) : null}
          </tbody>
        </table>
        <div className="actions">
          <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => void load(page - 1)}>Previous</Button>
          <span className="muted">{page} / {Math.max(1, Math.ceil(total / 20))}</span>
          <Button size="sm" variant="secondary" disabled={page * 20 >= total} onClick={() => void load(page + 1)}>Next</Button>
        </div>
      </div>
    </AdminShell>
  );
}
