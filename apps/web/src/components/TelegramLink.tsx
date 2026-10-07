"use client";

import { useEffect, useState } from "react";
import { Button } from "@namat/ui";
import { api } from "@/lib/api";
import { getStoredToken } from "@/lib/session";
import { useTx } from "@/components/Copy";

/**
 * Account-page control to link/unlink the Telegram companion bot. It only
 * renders once a link status is known; if the integration is not configured
 * the link-token call returns no deep link and we keep the section quiet.
 */
export function TelegramLink() {
  const tx = useTx();
  const [ready, setReady] = useState(false);
  const [linked, setLinked] = useState(false);
  const [linkedAt, setLinkedAt] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const token = getStoredToken();
    if (!token) return;
    try {
      const status = await api.telegramLinkStatus(token);
      setLinked(status.linked);
      setLinkedAt(status.linkedAt);
    } catch {
      /* non-fatal */
    } finally {
      setReady(true);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function link() {
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.telegramLinkToken(token);
      if (res.deepLink) {
        window.open(res.deepLink, "_blank", "noopener");
      } else {
        setError(tx("Telegram is not available right now.", "تيليجرام غير متاح حاليًا."));
      }
    } catch {
      setError(tx("Could not start linking.", "تعذر بدء الربط."));
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      await api.telegramUnlink(token);
      await refresh();
    } catch {
      setError(tx("Could not unlink.", "تعذر إلغاء الربط."));
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  return (
    <section className="form-panel" style={{ marginTop: "1.5rem" }}>
      <h2 style={{ marginTop: 0 }}>{tx("Telegram", "تيليجرام")}</h2>
      <p className="price-note">
        {tx(
          "Follow your account, devices and designs from Telegram, and get account alerts.",
          "تابع حسابك وأجهزتك وتصاميمك من تيليجرام، واستقبل تنبيهات حسابك.",
        )}
      </p>
      {error ? (
        <div className="notice warn" role="alert">{error}</div>
      ) : null}
      {linked ? (
        <>
          <p>
            {tx("Linked", "مربوط")} ✅
            {linkedAt ? ` · ${linkedAt.slice(0, 10)}` : ""}
          </p>
          <Button variant="secondary" disabled={busy} onClick={() => void unlink()}>
            {tx("Unlink Telegram", "إلغاء ربط تيليجرام")}
          </Button>
        </>
      ) : (
        <Button disabled={busy} onClick={() => void link()}>
          {busy ? tx("Opening…", "جارٍ الفتح…") : tx("Link Telegram", "ربط تيليجرام")}
        </Button>
      )}
    </section>
  );
}
