"use client";

import { useEffect, useState } from "react";
import { Button } from "@namat/ui";
import type { AiGeneration } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

export default function AiModerationPage() {
  const [items, setItems] = useState<AiGeneration[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setItems(await adminApi.aiGenerations(token));
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function moderate(id: string, status: "moderated" | "completed") {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.moderateAi(token, id, status);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Moderate failed");
    }
  }

  return (
    <AdminShell title="AI generations">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="banner">
        Review prompts and outputs only. Wallet card data must never appear here.
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="When" ar="الوقت" /></th>
              <th><Tx en="Status" ar="الحالة" /></th>
              <th><Tx en="Prompt" ar="الوصف" /></th>
              <th><Tx en="Style" ar="النمط" /></th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((g) => (
              <tr key={g.id}>
                <td>{g.createdAt}</td>
                <td>{g.status}</td>
                <td style={{ maxWidth: 280 }}>{g.prompt}</td>
                <td>{g.stylePresetId ?? "—"}</td>
                <td className="actions">
                  <Button size="sm" variant="danger" onClick={() => void moderate(g.id, "moderated")}>
                    Flag
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => void moderate(g.id, "completed")}>
                    Clear
                  </Button>
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No generations.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
