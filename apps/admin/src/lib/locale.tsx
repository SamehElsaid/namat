"use client";

import { useEffect, useState } from "react";

export type AdminLocale = "en" | "ar";
const KEY = "namat_locale";

export function useAdminLocale(): [AdminLocale, (next: AdminLocale) => void] {
  const [locale, setLocale] = useState<AdminLocale>("ar");
  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    const next: AdminLocale = stored === "en" ? "en" : "ar";
    applyAdminLocale(next);
    setLocale(next);
  }, []);
  function update(next: AdminLocale) {
    window.localStorage.setItem(KEY, next);
    applyAdminLocale(next);
    setLocale(next);
  }
  return [locale, update];
}

export function applyAdminLocale(locale: AdminLocale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function tr(locale: AdminLocale, en: string, ar: string): string {
  return locale === "ar" ? ar : en;
}

export function Tx({ en, ar }: { en: string; ar: string }) {
  const [locale] = useAdminLocale();
  return <>{tr(locale, en, ar)}</>;
}
