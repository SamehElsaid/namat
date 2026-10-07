"use client";

import { useLocale } from "./LocaleSwitch";

export function useTx() {
  const [locale] = useLocale();
  return (en: string, ar: string) => (locale === "ar" ? ar : en);
}

export function Bi({ en, ar }: { en: string; ar: string }) {
  const tx = useTx();
  return <>{tx(en, ar)}</>;
}
