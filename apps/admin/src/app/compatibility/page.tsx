"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import type { CompatibilityRule, CompatibilityState } from "@namat/shared";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx, tr, useAdminLocale } from "@/lib/locale";

const STATES: CompatibilityState[] = ["SUPPORTED", "TESTING", "UNSUPPORTED", "BLOCKED"];

type Draft = {
  minIosVersion: string;
  maxIosVersion: string;
  minAppVersion: string;
  state: CompatibilityState;
  supportedModels: string;
  notes: string;
};

const emptyDraft: Draft = {
  minIosVersion: "16.0",
  maxIosVersion: "",
  minAppVersion: "",
  state: "SUPPORTED",
  supportedModels: "",
  notes: "",
};

function toModels(text: string): string[] | undefined {
  const list = text.split(",").map((s) => s.trim()).filter(Boolean);
  return list.length ? list : undefined;
}

export default function CompatibilityAdminPage() {
  const [locale] = useAdminLocale();
  const [rules, setRules] = useState<CompatibilityRule[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [create, setCreate] = useState<Draft>(emptyDraft);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setRules(await adminApi.compatibility(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.createCompatibility(token, {
        minIosVersion: create.minIosVersion,
        maxIosVersion: create.maxIosVersion || undefined,
        minAppVersion: create.minAppVersion || undefined,
        state: create.state,
        supportedModels: toModels(create.supportedModels),
        notes: create.notes || undefined,
      });
      setCreate(emptyDraft);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Create failed");
    }
  }

  function startEdit(r: CompatibilityRule) {
    setEditing(r.id);
    setDraft({
      minIosVersion: r.minIosVersion,
      maxIosVersion: r.maxIosVersion ?? "",
      minAppVersion: r.minAppVersion ?? "",
      state: r.state ?? (r.isSupported ? "SUPPORTED" : "UNSUPPORTED"),
      supportedModels: (r.supportedModels ?? []).join(", "),
      notes: r.notes ?? "",
    });
  }

  async function saveEdit(id: string) {
    const token = getAdminToken();
    if (!token) return;
    try {
      await adminApi.updateCompatibility(token, {
        id,
        minIosVersion: draft.minIosVersion,
        maxIosVersion: draft.maxIosVersion || undefined,
        minAppVersion: draft.minAppVersion || undefined,
        state: draft.state,
        supportedModels: toModels(draft.supportedModels),
        notes: draft.notes || undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    }
  }

  async function remove(r: CompatibilityRule) {
    const token = getAdminToken();
    if (!token) return;
    if (!window.confirm(tr(locale, "Delete this compatibility rule?", "حذف قاعدة التوافق هذه؟"))) return;
    try {
      await adminApi.deleteCompatibility(token, r.id);
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed");
    }
  }

  const stateField = (value: CompatibilityState, onChange: (v: CompatibilityState) => void) => (
    <select value={value} onChange={(e) => onChange(e.target.value as CompatibilityState)}>
      {STATES.map((s) => (
        <option key={s} value={s}>{s}</option>
      ))}
    </select>
  );

  return (
    <AdminShell title="iOS compatibility">
      {error ? <div className="banner danger">{error}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <form className="form-row two" onSubmit={add}>
          <Input label={tr(locale, "Min iOS", "أدنى iOS")} value={create.minIosVersion} onChange={(e) => setCreate({ ...create, minIosVersion: e.target.value })} required />
          <Input label={tr(locale, "Max iOS", "أعلى iOS")} value={create.maxIosVersion} onChange={(e) => setCreate({ ...create, maxIosVersion: e.target.value })} />
          <Input label={tr(locale, "Min app version", "أدنى إصدار تطبيق")} value={create.minAppVersion} onChange={(e) => setCreate({ ...create, minAppVersion: e.target.value })} />
          <label style={{ display: "grid", gap: "0.3rem" }}>
            <span>{tr(locale, "State", "الحالة")}</span>
            {stateField(create.state, (v) => setCreate({ ...create, state: v }))}
          </label>
          <Input label={tr(locale, "Supported models (comma separated)", "الطُّرُز المدعومة (مفصولة بفواصل)")} value={create.supportedModels} onChange={(e) => setCreate({ ...create, supportedModels: e.target.value })} />
          <Input label={tr(locale, "Notes", "ملاحظات")} value={create.notes} onChange={(e) => setCreate({ ...create, notes: e.target.value })} />
          <div>
            <Button type="submit"><Tx en="Add rule" ar="إضافة قاعدة" /></Button>
          </div>
        </form>
      </div>
      <div className="panel table-wrap">
        <table>
          <thead>
            <tr>
              <th><Tx en="Min iOS" ar="أدنى iOS" /></th>
              <th><Tx en="Max iOS" ar="أعلى iOS" /></th>
              <th><Tx en="Min app" ar="أدنى تطبيق" /></th>
              <th><Tx en="State" ar="الحالة" /></th>
              <th><Tx en="Models" ar="الطُّرُز" /></th>
              <th><Tx en="Notes" ar="ملاحظات" /></th>
              <th><Tx en="Actions" ar="إجراءات" /></th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) =>
              editing === r.id ? (
                <tr key={r.id}>
                  <td><input value={draft.minIosVersion} style={{ width: "4rem" }} onChange={(e) => setDraft({ ...draft, minIosVersion: e.target.value })} /></td>
                  <td><input value={draft.maxIosVersion} style={{ width: "4rem" }} onChange={(e) => setDraft({ ...draft, maxIosVersion: e.target.value })} /></td>
                  <td><input value={draft.minAppVersion} style={{ width: "4rem" }} onChange={(e) => setDraft({ ...draft, minAppVersion: e.target.value })} /></td>
                  <td>{stateField(draft.state, (v) => setDraft({ ...draft, state: v }))}</td>
                  <td><input value={draft.supportedModels} onChange={(e) => setDraft({ ...draft, supportedModels: e.target.value })} /></td>
                  <td><input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></td>
                  <td className="actions">
                    <Button size="sm" onClick={() => void saveEdit(r.id)}><Tx en="Save" ar="حفظ" /></Button>
                    <Button size="sm" variant="secondary" onClick={() => setEditing(null)}><Tx en="Cancel" ar="إلغاء" /></Button>
                  </td>
                </tr>
              ) : (
                <tr key={r.id}>
                  <td>{r.minIosVersion}</td>
                  <td>{r.maxIosVersion ?? "—"}</td>
                  <td>{r.minAppVersion ?? "—"}</td>
                  <td>{r.state ?? (r.isSupported ? "SUPPORTED" : "UNSUPPORTED")}</td>
                  <td>{(r.supportedModels ?? []).join(", ") || "—"}</td>
                  <td>{r.notes ?? "—"}</td>
                  <td className="actions">
                    <Button size="sm" variant="secondary" onClick={() => startEdit(r)}><Tx en="Edit" ar="تعديل" /></Button>
                    <Button size="sm" variant="danger" onClick={() => void remove(r)}><Tx en="Delete" ar="حذف" /></Button>
                  </td>
                </tr>
              ),
            )}
            {rules.length === 0 ? (
              <tr>
                <td colSpan={7} className="muted"><Tx en="No rules." ar="لا توجد قواعد." /></td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
