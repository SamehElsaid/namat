"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@namat/ui";
import { ApiError, api } from "@/lib/api";
import { setStoredSession } from "@/lib/session";
import { safeNext } from "@/lib/safe-next";
import { useTx } from "@/components/Copy";

const GOOGLE_WEB_CLIENT_ID =
  "588751829801-hncn7v533cpfbbhj6f6nodi7emk92spf.apps.googleusercontent.com";

type GoogleAccounts = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential?: string }) => void;
      }) => void;
      renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
    };
  };
};

export default function LoginPage() {
  const router = useRouter();
  const tx = useTx();
  const googleButton = useRef<HTMLDivElement>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = () => {
      const google = (window as Window & { google?: GoogleAccounts }).google;
      const parent = googleButton.current;
      if (!google || !parent || cancelled) return;
      parent.replaceChildren();
      google.accounts.id.initialize({
        client_id: GOOGLE_WEB_CLIENT_ID,
        callback: (response) => {
          const idToken = response.credential;
          if (!idToken) return;
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const res = await api.loginWithGoogle(idToken);
              setStoredSession(res.accessToken, res.user.email);
              router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
            } catch {
              setError(
                document.documentElement.lang === "en"
                  ? "Google sign-in could not be completed. Try again."
                  : "تعذر تسجيل الدخول باستخدام Google. حاول مرة أخرى.",
              );
            } finally {
              setBusy(false);
            }
          })();
        },
      });
      google.accounts.id.renderButton(parent, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
        width: Math.min(360, Math.max(240, parent.clientWidth || 320)),
        locale: document.documentElement.lang === "en" ? "en" : "ar",
      });
    };
    const existing = document.getElementById("namat-google-gsi") as HTMLScriptElement | null;
    if (existing) {
      if ((window as Window & { google?: GoogleAccounts }).google) render();
      else existing.addEventListener("load", render);
      return () => {
        cancelled = true;
      };
    }
    const script = document.createElement("script");
    script.id = "namat-google-gsi";
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = render;
    script.onerror = () => {
      if (!cancelled) {
        setError(
          document.documentElement.lang === "en"
            ? "Google sign-in could not be completed. Try again."
            : "تعذر تسجيل الدخول باستخدام Google. حاول مرة أخرى.",
        );
      }
    };
    document.body.appendChild(script);
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function requestCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await api.requestOtp(email.trim());
      if (res.delivery === "pending_smtp") {
        setError(
          tx(
            "The verification code could not be sent. Try again later.",
            "تعذر إرسال رمز التحقق الآن. حاول مرة أخرى لاحقًا.",
          ),
        );
        return;
      }
      setStep("code");
      setMessage(
        res.delivery === "dev_log"
          ? tx(
              "Development only: the code was written to the API log, not to email.",
              "للتطوير فقط: كُتب الرمز في سجل الواجهة وليس في البريد.",
            )
          : tx("Check your email for a one-time code.", "تحقق من بريدك لرمز لمرة واحدة."),
      );
    } catch (err) {
      setError(customerAuthError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.verifyOtp(email.trim(), code.trim());
      setStoredSession(res.accessToken, res.user.email);
      router.push(safeNext(new URLSearchParams(window.location.search).get("next")));
    } catch (err) {
      setError(customerAuthError(err, tx));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="container auth-page">
      <header className="page-hero">
        <div className="eyebrow">{tx("NAMAT", "نَمَط")}</div>
        <h1>{tx("Change your card’s look.", "غيّر مظهر بطاقتك.")}</h1>
        <p>
          {tx(
            "Continue with Google. Email stays available if you need it.",
            "تابع باستخدام Google. البريد يبقى متاحًا إذا احتجته.",
          )}
        </p>
      </header>
      <div className="form-panel">
        <p className="muted">{tx("Continue with Google", "المتابعة باستخدام Google")}</p>
        <div className="google-slot" ref={googleButton} />
        {error && !emailOpen ? (
          <div className="notice" role="alert">
            {error}
          </div>
        ) : null}
        <Button type="button" variant="ghost" onClick={() => setEmailOpen((open) => !open)}>
          {tx("Continue with email", "الدخول بالبريد الإلكتروني")}
        </Button>
      </div>

      {emailOpen && step === "email" ? (
        <form className="form-panel" onSubmit={requestCode}>
          <Input
            label={tx("Email", "البريد")}
            type="email"
            name="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error ? (
            <div className="notice" role="alert">
              {error}
            </div>
          ) : null}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? tx("Sending…", "جارٍ الإرسال…") : tx("Send code", "إرسال الرمز")}
          </Button>
        </form>
      ) : null}

      {emailOpen && step === "code" ? (
        <form className="form-panel" onSubmit={verifyCode}>
          <Input
            label={tx("Email", "البريد")}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Input
            label={tx("One-time code", "رمز لمرة واحدة")}
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            hint={tx("Usually 6 digits. Expires quickly.", "غالباً 6 أرقام. ينتهي سريعاً.")}
          />
          {message ? <div className="notice">{message}</div> : null}
          {error ? (
            <div className="notice" role="alert">
              {error}
            </div>
          ) : null}
          <Button type="submit" size="lg" disabled={busy}>
            {busy ? tx("Verifying…", "جارٍ التحقق…") : tx("Verify and continue", "تحقق وتابع")}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function customerAuthError(
  err: unknown,
  tx: (en: string, ar: string) => string,
): string {
  const body =
    err instanceof ApiError && err.body && typeof err.body === "object"
      ? (err.body as { error?: unknown })
      : null;
  const code = typeof body?.error === "string" ? body.error : "";
  if (
    code === "EmailDeliveryUnavailable" ||
    (err instanceof ApiError && err.status === 503)
  ) {
    return tx(
      "The verification code could not be sent. Try again later.",
      "تعذر إرسال رمز التحقق الآن. حاول مرة أخرى لاحقًا.",
    );
  }
  if (code === "OtpExpired") {
    return tx(
      "That code has expired. Request a new one.",
      "انتهت صلاحية الرمز. اطلب رمزًا جديدًا.",
    );
  }
  if (code === "OtpInvalid" || code === "OtpAttemptsExceeded") {
    return tx("That code is not correct.", "رمز التحقق غير صحيح.");
  }
  if (code === "OtpCooldown" || code === "OtpRateLimited") {
    return tx(
      "Wait a moment before requesting another code.",
      "انتظر قليلًا قبل طلب رمز جديد.",
    );
  }
  if (err instanceof ApiError && err.status === 0) {
    return tx(
      "Could not connect. Check your internet and try again.",
      "تعذر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.",
    );
  }
  return tx(
    "Sign-in could not be completed. Try again.",
    "تعذر إكمال الدخول. حاول مرة أخرى.",
  );
}
