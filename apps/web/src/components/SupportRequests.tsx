"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Button, Input } from "@namat/ui";
import { ApiError, api, type SupportRequest } from "@/lib/api";
import { getStoredToken } from "@/lib/session";
import { useTx } from "@/components/Copy";

export function SupportRequests() {
  const tx = useTx();
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [requests, setRequests] = useState<SupportRequest[]>([]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function load(token: string) {
    try {
      setRequests(await api.mySupportRequests(token));
    } catch {
      /* keep the form usable even if the list fails */
    }
  }

  useEffect(() => {
    const token = getStoredToken();
    void (async () => {
      if (token) {
        try {
          await api.me(token);
          setSignedIn(true);
          await load(token);
        } catch {
          setSignedIn(false);
        }
      }
      setReady(true);
    })();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.createSupportRequest(token, { subject: subject.trim(), body: body.trim() });
      setSubject("");
      setBody("");
      setNotice(tx("Your request was sent.", "تم إرسال طلبك."));
      await load(token);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? tx("Could not send your request.", "تعذر إرسال الطلب.")
          : tx("Could not send your request.", "تعذر إرسال الطلب."),
      );
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  if (!signedIn) {
    return (
      <div className="form-panel" style={{ marginTop: "1.5rem" }}>
        <p>{tx("Sign in to open a support request.", "سجّل الدخول لفتح طلب دعم.")}</p>
        <Link href="/login?next=/support">
          <Button size="lg">{tx("Sign in", "تسجيل الدخول")}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div style={{ marginTop: "2rem" }}>
      <h2>{tx("Open a request", "افتح طلبًا")}</h2>
      {notice ? (
        <div className="notice" role="status">{notice}</div>
      ) : null}
      {error ? (
        <div className="notice warn" role="alert">{error}</div>
      ) : null}
      <form className="form-panel" onSubmit={submit}>
        <Input
          label={tx("Subject", "الموضوع")}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
        <label style={{ display: "block", marginTop: "0.75rem" }}>
          <span>{tx("Message", "الرسالة")}</span>
          <textarea
            value={body}
            rows={5}
            required
            style={{ width: "100%", marginTop: "0.35rem" }}
            onChange={(e) => setBody(e.target.value)}
          />
        </label>
        <p className="price-note" style={{ marginTop: "0.5rem" }}>
          {tx(
            "Do not include card numbers, CVV, or PIN.",
            "لا تُضمّن أرقام البطاقة أو رمز الأمان أو PIN.",
          )}
        </p>
        <Button type="submit" size="lg" disabled={busy} >
          {busy ? tx("Sending…", "جارٍ الإرسال…") : tx("Send request", "إرسال الطلب")}
        </Button>
      </form>

      {requests.length > 0 ? (
        <div style={{ marginTop: "2rem" }}>
          <h2>{tx("Your requests", "طلباتك")}</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {requests.map((r) => (
              <div key={r.id} className="panel" style={{ padding: "1rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem" }}>
                  <strong>{r.subject ?? tx("Request", "طلب")}</strong>
                  <span className="price-note">
                    {r.status === "resolved"
                      ? tx("Resolved", "تم الحل")
                      : tx("Open", "مفتوح")}
                  </span>
                </div>
                <p style={{ whiteSpace: "pre-wrap", margin: "0.5rem 0" }}>{r.body}</p>
                {r.reply ? (
                  <div
                    className="notice"
                    style={{ marginTop: "0.5rem" }}
                  >
                    <strong>{tx("Reply", "الرد")}: </strong>
                    <span style={{ whiteSpace: "pre-wrap" }}>{r.reply}</span>
                  </div>
                ) : (
                  <p className="price-note">
                    {tx("Awaiting a reply.", "بانتظار الرد.")}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
