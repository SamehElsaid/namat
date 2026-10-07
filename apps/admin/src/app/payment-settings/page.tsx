"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button, Input } from "@namat/ui";
import { AdminShell } from "@/components/AdminShell";
import { AdminApiError, adminApi } from "@/lib/api";
import { getAdminToken } from "@/lib/session";
import { Tx } from "@/lib/locale";

type Settings = Awaited<ReturnType<typeof adminApi.paymentSettings>>;

export default function PaymentSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [secretKey, setSecretKey] = useState("");
  const [publishableKey, setPublishableKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");

  async function load() {
    const token = getAdminToken();
    if (!token) return;
    try {
      setSettings(await adminApi.paymentSettings(token));
      setError(null);
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Load failed");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = getAdminToken();
    if (!token) return;
    const form = new FormData(event.currentTarget);
    const checkoutEnabled = form.get("checkoutEnabled") === "on";
    const mode = form.get("mode") === "live" ? "live" : "test";
    try {
      const result = await adminApi.updatePaymentSettings(token, {
        checkoutEnabled,
        mode,
        secretKey,
        publishableKey,
        webhookSecret,
      });
      setSecretKey("");
      setPublishableKey("");
      setWebhookSecret("");
      if (!result.ok) {
        setNotice(null);
        setError((result.reasons ?? []).join(", ") || "Settings were not saved");
      } else {
        setError(null);
        setNotice("Saved. Existing secrets stay in place when fields are left blank.");
      }
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Save failed");
    }
  }

  async function clearCredential(
    field: "clearSecretKey" | "clearPublishableKey" | "clearWebhookSecret",
    label: string,
  ) {
    const token = getAdminToken();
    if (!token) return;
    if (!window.confirm(`Delete the stored ${label}? Checkout will be disabled until a new value is set.`)) {
      return;
    }
    try {
      // Disabling checkout alongside the clear keeps the readiness gate from
      // blocking the removal of a credential the live config still depends on.
      const result = await adminApi.updatePaymentSettings(token, {
        checkoutEnabled: false,
        [field]: true,
      });
      if (!result.ok) {
        setNotice(null);
        setError((result.reasons ?? []).join(", ") || "Credential was not removed");
      } else {
        setError(null);
        setNotice(`${label} removed. Checkout is disabled until credentials are set again.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof AdminApiError ? err.message : "Delete failed");
    }
  }

  return (
    <AdminShell title="Payment settings">
      {error ? <div className="banner danger">{error}</div> : null}
      {notice ? <div className="banner">{notice}</div> : null}
      <div className="panel" style={{ marginBottom: "1rem" }}>
        <p>Checkout: {settings?.checkoutAvailable ? "available" : "unavailable"}</p>
        <p>Enabled: {settings?.checkoutEnabled ? "yes" : "no"} · Mode: {settings?.mode ?? "—"} · Ready: {settings?.ready ? "yes" : "no"}</p>
        <p>Secret: {settings?.secretKey ?? "not set"}</p>
        <p>Publishable: {settings?.publishableKey ?? "not set"} <span className="muted">(optional for Hosted Invoice)</span></p>
        <p>Webhook secret: {settings?.webhookSecretConfigured ? "configured" : "missing"}</p>
        <p className="muted">
          <Tx
            en="Blank credential fields keep the current values. Stored secrets are never shown again."
            ar="ترك حقول البيانات فارغة يبقي القيم الحالية. لا تُعرض الأسرار المخزنة مرة أخرى."
          />
        </p>
        {!settings?.credentialReplacementAvailable ? (
          <p className="muted">Credential replacement needs PAYMENT_CONFIG_KEY outside the database.</p>
        ) : null}
      </div>
      <form className="panel form-row" onSubmit={save}>
        <label>
          <input name="checkoutEnabled" type="checkbox" defaultChecked={settings?.checkoutEnabled} key={String(settings?.checkoutEnabled)} />{" "}
          Checkout enabled
        </label>
        <label>
          Mode
          <select name="mode" defaultValue={settings?.mode ?? "test"} key={settings?.mode ?? "test"}>
            <option value="test">test</option>
            <option value="live">live</option>
          </select>
        </label>
        <div className="form-row two">
          <Input label="Replace secret key" value={secretKey} onChange={(e) => setSecretKey(e.target.value)} autoComplete="off" />
          <Button type="button" variant="danger" size="sm" disabled={settings?.secretKey == null} onClick={() => void clearCredential("clearSecretKey", "secret key")}>Delete secret key</Button>
        </div>
        <div className="form-row two">
          <Input label="Replace publishable key (optional)" value={publishableKey} onChange={(e) => setPublishableKey(e.target.value)} autoComplete="off" />
          <Button type="button" variant="danger" size="sm" disabled={settings?.publishableKey == null} onClick={() => void clearCredential("clearPublishableKey", "publishable key")}>Delete publishable key</Button>
        </div>
        <div className="form-row two">
          <Input label="Replace webhook secret" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} autoComplete="off" />
          <Button type="button" variant="danger" size="sm" disabled={!settings?.webhookSecretConfigured} onClick={() => void clearCredential("clearWebhookSecret", "webhook secret")}>Delete webhook secret</Button>
        </div>
        <Button type="submit">Save</Button>
      </form>
    </AdminShell>
  );
}
