"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";

type Note = Awaited<ReturnType<typeof adminApi.supportNotes>>[number];

export default function SupportPage() {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<Note[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  async function load(q = query) {
    const token = getAdminToken();
    if (!token) return;
    try {
      setRows(await adminApi.supportNotes(token, q));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load("");
  }, []);

  function search(event: FormEvent) {
    event.preventDefault();
    void load(query);
  }

  async function resolve(id: string) {
    const token = getAdminToken();
    if (!token) return;
    const outcome = window.prompt("Outcome");
    if (!outcome) return;
    try {
      await adminApi.updateSupportNote(token, id, { status: "resolved", outcome });
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Update failed");
    }
  }

  function startReply(row: Note) {
    setReplyFor(row.id);
    setReplyText(row.reply ?? "");
  }

  async function sendReply(id: string) {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.updateSupportNote(token, id, {
        reply: replyText.trim(),
        status: "resolved",
      });
      setReplyFor(null);
      setReplyText("");
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Reply failed");
    }
  }

  return (
    <AdminShell title="Support notes">
      {error ? <div className="banner danger">{error}</div> : null}
      <p className="muted">
        Customer requests and staff notes. Replying sends the message to the customer&apos;s account.
      </p>
      <form className="panel form-row" onSubmit={search} style={{ marginBottom: "1rem" }}>
        <Input label="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
        <Button type="submit">Search</Button>
      </form>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>From</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Message</th>
              <th>Reply</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.createdAt}</td>
                <td>
                  {row.source === "customer" ? "👤 " : "🛟 "}
                  {row.actorEmail ?? "—"}
                </td>
                <td>{row.subject ?? "—"}</td>
                <td>
                  {row.status}
                  {row.outcome ? ` · ${row.outcome}` : ""}
                </td>
                <td>{row.body}</td>
                <td>
                  {replyFor === row.id ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                      <textarea
                        value={replyText}
                        rows={3}
                        style={{ width: "100%" }}
                        onChange={(e) => setReplyText(e.target.value)}
                      />
                      <div className="actions">
                        <Button size="sm" onClick={() => void sendReply(row.id)}>Send</Button>
                        <Button size="sm" variant="secondary" onClick={() => setReplyFor(null)}>Cancel</Button>
                      </div>
                    </div>
                  ) : row.reply ? (
                    <span>{row.reply}</span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="actions">
                  <Button size="sm" variant="secondary" onClick={() => startReply(row)}>
                    {row.reply ? "Edit reply" : "Reply"}
                  </Button>
                  {row.status === "open" ? (
                    <Button size="sm" onClick={() => void resolve(row.id)}>Resolve</Button>
                  ) : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted">No notes.</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
