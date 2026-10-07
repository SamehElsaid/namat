"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@namat/ui";
import { ApiError, api, type CustomerEnrollment, type CustomerEntitlement } from "@/lib/api";
import { getStoredToken } from "@/lib/session";
import { useTx } from "@/components/Copy";

const STEPS = [
  ["Purchase verified", "تم التحقق من الشراء"],
  ["Register this iPhone", "تسجيل هذا iPhone"],
  ["Install NAMAT", "تثبيت NAMAT"],
  ["Open NAMAT", "فتح التطبيق"],
  ["Complete device setup", "إكمال الإعداد"],
] as const;

export default function AccountInstallPage() {
  const tx = useTx();
  const router = useRouter();
  const [entitlement, setEntitlement] = useState<CustomerEntitlement | null>(null);
  const [current, setCurrent] = useState<CustomerEnrollment | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(id?: string) {
    const token = getStoredToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    const ent = await api.entitlement(token).catch(() => null);
    setEntitlement(ent);
    const rows = await api.enrollments(token);
    const next =
      rows.find((row) => row.id === (id ?? current?.id)) ??
      rows.find((row) => !row.activated) ??
      rows[0] ??
      null;
    setCurrent(next);
    if (next?.signingStatus === "READY") {
      const link = await api.enrollmentInstallLink(token, next.id);
      setInstallUrl(link.installUrl);
    } else {
      setInstallUrl(null);
    }
  }

  useEffect(() => {
    void refresh().catch((err) => setError(message(err, tx)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!current?.id) return;
    if (current.signingStatus === "READY" || current.signingStatus === "FAILED") return;
    if (current.status === "FAILED" || current.status === "EXPIRED") return;
    const timer = window.setInterval(() => {
      void refresh(current.id).catch(() => undefined);
    }, 4000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, current?.status, current?.signingStatus]);

  async function register() {
    const token = getStoredToken();
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const started = await api.startEnrollment(token);
      setCurrent(started);
      if (started.profileUrl) {
        window.location.href = started.profileUrl;
      }
    } catch (err) {
      setError(message(err, tx));
    } finally {
      setBusy(false);
    }
  }

  const active = entitlement?.status === "active";
  const states = stepStates(active, current);

  return (
    <div className="container">
      <header className="page-hero">
        <h1>{tx("Set up this iPhone", "إعداد جهازك")}</h1>
        <p>
          {tx(
            "Register this iPhone, then install NAMAT. You do not send a device code to anyone.",
            "سجّل هذا iPhone ثم ثبّت NAMAT. لا ترسل رمز الجهاز لأي شخص.",
          )}
        </p>
      </header>

      {error ? (
        <div className="notice warn" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      ) : null}

      <ol className="install-steps">
        {STEPS.map(([en, ar], index) => (
          <li key={en}>
            <strong>
              {index + 1}. {tx(en, ar)}
            </strong>
            <div className="muted">{stateLabel(states[index], tx)}</div>
          </li>
        ))}
      </ol>

      <section className="account-block" style={{ maxWidth: "40rem", marginTop: "1rem" }}>
        {!active ? (
          <div className="notice">
            {tx("Purchase NAMAT to set up this iPhone.", "اشترِ NAMAT لإعداد هذا iPhone.")}{" "}
            <Link href="/checkout">{tx("Purchase", "الشراء")}</Link>
          </div>
        ) : null}

        {active && (!current || current.status === "DISCOVERED" || current.status === "EXPIRED") ? (
          <Button onClick={() => void register()} disabled={busy}>
            {tx("Register this iPhone", "تسجيل هذا iPhone")}
          </Button>
        ) : null}

        {current?.customerMessage ? (
          <div className="notice warn" style={{ marginTop: "1rem" }}>
            {customerCopy(current, tx)}
          </div>
        ) : null}

        {preparing(current) ? (
          <p style={{ marginTop: "1rem" }}>
            {tx("Preparing NAMAT for this iPhone.", "جاري تجهيز التطبيق لجهازك")}
          </p>
        ) : null}

        {current?.status === "INSTALL_READY" || current?.signingStatus === "READY" ? (
          <div style={{ marginTop: "1rem" }}>
            <div className="notice">
              {tx("This iPhone is registered.", "تم تسجيل جهازك")}
            </div>
            {installUrl ? (
              <div className="cta-row" style={{ marginTop: "1rem" }}>
                <a href={installUrl}>
                  <Button>{tx("Install NAMAT", "تثبيت NAMAT")}</Button>
                </a>
              </div>
            ) : null}
          </div>
        ) : null}

        {current?.developerModeRequired ? (
          <div style={{ marginTop: "1rem" }}>
            <h2>{tx("If iOS asks", "إذا طلب iOS")}</h2>
            <p>
              {tx(
                "After NAMAT is installed, iOS may ask you to turn on Developer Mode before the app opens. Go to Settings → Privacy & Security → Developer Mode, then restart. You do not need this before registering the iPhone.",
                "بعد تثبيت NAMAT قد يطلب iOS تفعيل نمط المطور قبل فتح التطبيق. الإعدادات ← الخصوصية والأمن ← نمط المطور، ثم أعد التشغيل. لا تحتاج إلى ذلك قبل تسجيل iPhone.",
              )}
            </p>
          </div>
        ) : null}

        {current?.label ? (
          <p className="muted" style={{ marginTop: "1rem" }}>
            {current.label}
            {current.iosVersion ? ` · iOS ${current.iosVersion}` : ""}
          </p>
        ) : null}

        <div className="cta-row" style={{ marginTop: "1rem" }}>
          <Link href="/account">{tx("Account", "الحساب")}</Link>
        </div>
      </section>
    </div>
  );
}

function preparing(row: CustomerEnrollment | null): boolean {
  if (!row?.signingStatus) return false;
  return ["QUEUED", "REGISTERING_DEVICE", "GENERATING_PROFILE", "SIGNING"].includes(
    row.signingStatus,
  );
}

function stepStates(
  active: boolean,
  row: CustomerEnrollment | null,
): Array<"done" | "current" | "upcoming"> {
  if (!active) return ["current", "upcoming", "upcoming", "upcoming", "upcoming"];
  const registered =
    row?.status === "REGISTERED" ||
    row?.status === "REGISTERING" ||
    row?.status === "INSTALL_READY";
  const ready = row?.signingStatus === "READY" || row?.status === "INSTALL_READY";
  const opened = Boolean(row?.activated);
  if (opened) return ["done", "done", "done", "done", "done"];
  if (ready) return ["done", "done", "done", "current", "upcoming"];
  if (registered || preparing(row)) return ["done", "done", "current", "upcoming", "upcoming"];
  return ["done", "current", "upcoming", "upcoming", "upcoming"];
}

function stateLabel(
  state: "done" | "current" | "upcoming",
  tx: (en: string, ar: string) => string,
): string {
  if (state === "done") return tx("Done", "تم");
  if (state === "current") return tx("Current step", "الخطوة الحالية");
  return tx("Next", "التالي");
}

function customerCopy(
  row: CustomerEnrollment,
  tx: (en: string, ar: string) => string,
): string {
  switch (row.failureCode) {
    case "capacity_exhausted":
      return tx(
        "Installation is currently unavailable because device capacity is full. Your purchase stays active.",
        "التثبيت غير متاح حالياً لأن سعة الأجهزة اكتملت. شراؤك يبقى فعالاً.",
      );
    case "device_limit":
      return tx(
        "This account already has an active iPhone. Transfer activation to continue.",
        "هذا الحساب لديه آيفون مفعّل. انقل التفعيل للمتابعة.",
      );
    case "device_owned_by_another_account":
      return tx(
        "This iPhone is already linked to another NAMAT account.",
        "هذا iPhone مرتبط بحساب NAMAT آخر.",
      );
    case "expired":
    case "replay":
      return tx(
        "This registration link expired. Start again.",
        "انتهت صلاحية رابط التسجيل. ابدأ من جديد.",
      );
    default:
      return tx(
        row.customerMessage ?? "Installation is currently unavailable. Your purchase stays active.",
        "التثبيت غير متاح حالياً. شراؤك يبقى فعالاً.",
      );
  }
}

function message(err: unknown, tx: (en: string, ar: string) => string): string {
  if (err instanceof ApiError) {
    if (err.status === 400) {
      return tx(
        "This account already has an active iPhone. Transfer activation to continue.",
        "هذا الحساب لديه آيفون مفعّل. انقل التفعيل للمتابعة.",
      );
    }
    return tx(
      "NAMAT could not continue this step. Try again.",
      "تعذر على NAMAT متابعة هذه الخطوة. حاول مرة أخرى.",
    );
  }
  return tx("NAMAT could not continue this step. Try again.", "تعذر على NAMAT متابعة هذه الخطوة. حاول مرة أخرى.");
}
