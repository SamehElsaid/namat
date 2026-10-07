"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useEffect, useState } from "react";
import { Button } from "@namat/ui";
import { AdminApiError, adminApi } from "@/lib/api";
import {
  clearAdminSession,
  getAdminEmail,
  getAdminToken,
} from "@/lib/session";
import { tr, useAdminLocale } from "@/lib/locale";

const NAV = [
  { href: "/", en: "Dashboard", ar: "لوحة التحكم" },
  { href: "/designs", en: "Designs", ar: "التصاميم" },
  { href: "/categories", en: "Categories", ar: "التصنيفات" },
  { href: "/users", en: "Users", ar: "المستخدمون" },
  { href: "/customers", en: "Customers", ar: "العملاء" },
  { href: "/support", en: "Support notes", ar: "ملاحظات الدعم" },
  { href: "/devices", en: "Devices", ar: "الأجهزة" },
  { href: "/enrollments", en: "Installations", ar: "التثبيت" },
  { href: "/packages", en: "Packages & pricing", ar: "الباقات والأسعار" },
  { href: "/purchases", en: "Purchases", ar: "المشتريات" },
  { href: "/payments", en: "Payments", ar: "المدفوعات" },
  { href: "/payment-settings", en: "Payment settings", ar: "إعدادات الدفع" },
  { href: "/compatibility", en: "iOS compatibility", ar: "توافق iOS" },
  { href: "/app-versions", en: "App versions", ar: "إصدارات التطبيق" },
  { href: "/remote-config", en: "Remote config", ar: "الإعداد البعيد" },
  { href: "/analytics", en: "Analytics", ar: "التحليلات" },
  { href: "/audit", en: "Audit logs", ar: "سجل التدقيق" },
  { href: "/ai", en: "AI moderation", ar: "مراجعة الذكاء" },
  { href: "/system", en: "System status", ar: "حالة النظام" },
];

export function AdminShell({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [locale, setLocale] = useAdminLocale();
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [denied, setDenied] = useState<string | null>(null);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      router.replace("/login");
      return;
    }
    setEmail(getAdminEmail());
    const emailHint = getAdminEmail();
    // Raw ADMIN_API_TOKEN sessions skip /auth/me role checks and rely on
    // API admin route authorization instead.
    if (emailHint === "token-session") {
      setReady(true);
      return;
    }

    void adminApi
      .me(token)
      .then((user) => {
        if (user.role !== "admin" && user.role !== "owner") {
          clearAdminSession();
          setDenied(tr(locale, "Admin role required.", "يلزم دور مشرف."));
          router.replace("/login");
          return;
        }
        if (user.sessionPurpose !== "staff") {
          clearAdminSession();
          router.replace("/login");
          return;
        }
        setEmail(user.email);
        setReady(true);
      })
      .catch((err) => {
        if (err instanceof AdminApiError && (err.status === 401 || err.status === 403)) {
          clearAdminSession();
          router.replace("/login");
          return;
        }
        // Network / API-not-ready: keep shell usable with stored token.
        setReady(true);
      });
  }, [router]);

  function signOut() {
    const token = getAdminToken();
    if (token) void adminApi.logout(token).catch(() => undefined);
    clearAdminSession();
    router.replace("/login");
  }

  if (denied) {
    return (
      <div className="gate">
        <div className="banner danger">{denied}</div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="gate">
        <p className="muted">{tr(locale, "Checking admin session…", "جارٍ التحقق من جلسة المشرف…")}</p>
      </div>
    );
  }

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="brand">NAMAT Admin</div>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? "active" : undefined}
          >
            {tr(locale, item.en, item.ar)}
          </Link>
        ))}
      </aside>
      <div className="admin-main">
        <header className="admin-header">
          <div>
            <h1>
              {(() => {
                const current = NAV.find((item) => item.href === pathname);
                return current ? tr(locale, current.en, current.ar) : title;
              })()}
            </h1>
            <div className="muted" style={{ fontSize: "0.85rem" }}>
              {email}
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
            >
              {locale === "ar" ? "English" : "العربية"}
            </Button>
            <Button variant="secondary" size="sm" onClick={signOut}>
              {tr(locale, "Sign out", "خروج")}
            </Button>
          </div>
        </header>
        {children}
      </div>
    </div>
  );
}
