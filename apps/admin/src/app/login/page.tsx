"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input } from "@namat/ui";
import { AdminApiError, adminApi } from "@/lib/api";
import { setAdminSession } from "@/lib/session";

type Step = "code" | "password-login" | "set-password";

export default function AdminLoginPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("code");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function verifyCode(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await adminApi.verifyOwnerCode(email.trim(), code.trim());
      if (!res.passwordSetupRequired) {
        setError("يلزم تعيين كلمة المرور قبل فتح لوحة المالك.");
        return;
      }
      setPassword("");
      setConfirmation("");
      setStep("set-password");
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await adminApi.requestOwnerCode(email.trim());
      setNote("إذا كان الحساب مؤهلاً، سيصلك رمز الدخول المؤقت على البريد.");
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function forgot() {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await adminApi.forgotOwnerPassword(email.trim());
      setStep("code");
      setNote("إذا كان الحساب مؤهلاً، سيصلك رمز الدخول المؤقت على البريد.");
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function signInWithPassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.ownerLogin(email.trim(), password);
      if (res.user.role !== "admin" && res.user.role !== "owner") {
        setError("هذا الحساب ليس مالك المشروع.");
        return;
      }
      if (res.passwordSetupRequired) {
        setStep("set-password");
        return;
      }
      setAdminSession(res.accessToken, res.user.email);
      router.replace("/");
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePassword(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await adminApi.setOwnerPassword(password, confirmation);
      if (res.passwordSetupRequired || (res.user.role !== "admin" && res.user.role !== "owner")) {
        setError("يلزم تعيين كلمة المرور قبل فتح لوحة المالك.");
        return;
      }
      setAdminSession(res.accessToken, res.user.email);
      router.replace("/");
    } catch (err) {
      setError(loginError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <div className="login-panel" dir="rtl" lang="ar">
        <h1>دخول المالك</h1>
        <p>لوحة المالك لا تُفتح قبل تعيين كلمة المرور.</p>

        {step === "code" ? (
          <form className="form-row" onSubmit={verifyCode}>
            <Input
              label="البريد الإلكتروني"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="رمز الدخول المؤقت"
              name="code"
              autoComplete="one-time-code"
              required
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            {note ? <div className="banner">{note}</div> : null}
            {error ? <div className="banner danger">{error}</div> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "جارٍ التحقق…" : "دخول"}
            </Button>
            <button type="button" className="login-link" disabled={busy} onClick={() => void sendCode()}>
              إرسال رمز الدخول المؤقت
            </button>
            <button type="button" className="login-link" onClick={() => { setError(null); setStep("password-login"); }}>
              الدخول بكلمة المرور
            </button>
          </form>
        ) : null}

        {step === "password-login" ? (
          <form className="form-row" onSubmit={signInWithPassword}>
            <Input
              label="البريد الإلكتروني"
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Input
              label="كلمة المرور"
              type="password"
              name="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {error ? <div className="banner danger">{error}</div> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "جارٍ التحقق…" : "دخول"}
            </Button>
            <button type="button" className="login-link" disabled={busy} onClick={() => void forgot()}>
              نسيت كلمة المرور؟
            </button>
            <button type="button" className="login-link" onClick={() => { setError(null); setStep("code"); }}>
              رمز الدخول المؤقت
            </button>
          </form>
        ) : null}

        {step === "set-password" ? (
          <form className="form-row" onSubmit={savePassword}>
            <h2>تعيين كلمة المرور</h2>
            <Input
              label="تعيين كلمة المرور"
              type="password"
              name="new-password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              hint="١٢ حرفًا على الأقل."
            />
            <Input
              label="تأكيد كلمة المرور"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
            />
            {error ? <div className="banner danger">{error}</div> : null}
            <Button type="submit" disabled={busy}>
              {busy ? "جارٍ الحفظ…" : "دخول"}
            </Button>
          </form>
        ) : null}
      </div>
    </div>
  );
}

function loginError(err: unknown): string {
  const body =
    err instanceof AdminApiError && err.body && typeof err.body === "object"
      ? (err.body as { error?: unknown })
      : null;
  const code = typeof body?.error === "string" ? body.error : "";
  if (code === "EmailDeliveryUnavailable" || (err instanceof AdminApiError && err.status === 503)) {
    return "إرسال البريد غير متاح. استخدم رمز الدخول المؤقت الذي وصلك بطريقة آمنة.";
  }
  if (code === "LoginCodeExpired") return "انتهت صلاحية رمز الدخول المؤقت.";
  if (code === "LoginCodeInvalid" || code === "LoginCodeAttemptsExceeded") {
    return "رمز الدخول المؤقت غير صحيح.";
  }
  if (code === "LoginCodeRateLimited" || code === "LoginCodeCooldown") {
    return "انتظر قليلًا قبل طلب رمز جديد.";
  }
  if (code === "PasswordConfirmationMismatch") return "تأكيد كلمة المرور غير مطابق.";
  if (code === "PasswordTooWeak") return "استخدم ١٢ حرفًا على الأقل.";
  if (code === "PasswordAttemptsExceeded") return "محاولات كثيرة. انتظر ثم أعد المحاولة.";
  if (code === "PasswordInvalid") return "تعذر الدخول. تحقق من البريد وكلمة المرور.";
  if (code === "PasswordSetupRequired") return "يلزم تعيين كلمة المرور قبل فتح لوحة المالك.";
  return "تعذر إكمال الدخول. حاول مرة أخرى.";
}
