"use client";

import { messages, type Locale } from "@namat/shared";
import { useEffect, useState } from "react";

const KEY = "namat_locale";

export function useLocale(): [Locale, (next: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("ar");
  useEffect(() => {
    const stored = window.localStorage.getItem(KEY);
    const next: Locale = stored === "en" ? "en" : "ar";
    apply(next);
    setLocale(next);
  }, []);
  function update(next: Locale) {
    window.localStorage.setItem(KEY, next);
    apply(next);
    setLocale(next);
  }
  return [locale, update];
}

function apply(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
}

export function t(locale: Locale, key: keyof typeof messages.en): string {
  return messages[locale][key];
}

export function LocaleSwitch() {
  const [locale, setLocale] = useLocale();
  return (
    <button
      type="button"
      className="locale-switch nav-keep"
      onClick={() => setLocale(locale === "ar" ? "en" : "ar")}
      style={{ background: "transparent", border: 0, cursor: "pointer" }}
    >
      {t(locale, "lang")}
    </button>
  );
}
