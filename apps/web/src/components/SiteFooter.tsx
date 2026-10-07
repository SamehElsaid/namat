"use client";

import Link from "next/link";
import { t, useLocale } from "./LocaleSwitch";

export function SiteFooter() {
  const [locale] = useLocale();
  return (
    <footer className="site-footer">
      <Link href="/" className="brand" aria-label={t(locale, "navHome")}>
        {locale === "ar" ? "نَمَط" : "NAMAT"}
        <span>{locale === "ar" ? "NAMAT" : "نَمَط"}</span>
      </Link>
      <span>
        {locale === "ar" ? (
          <>
            صورة تختارها. وبطاقة بطابعك.
            <br />
            منتج سعودي، طُوّر بأيدٍ سعودية.
          </>
        ) : (
          <>
            A look you choose. A card with your mark.
            <br />
            A Saudi product, made in Saudi Arabia.
          </>
        )}
      </span>
      <div className="footer-links">
        <div>
          <Link href="/how-it-works">{t(locale, "navHow")}</Link>
          <Link href="/compatibility">{t(locale, "navCompat")}</Link>
          <Link href="/pricing">{t(locale, "navPricing")}</Link>
          <Link href="/checkout">{t(locale, "navBuy")}</Link>
          <Link href="/install">{t(locale, "navInstall")}</Link>
          <Link href="/account">{t(locale, "navAccount")}</Link>
        </div>
        <div>
          <Link href="/faq">{t(locale, "navFaq")}</Link>
          <Link href="/support">{t(locale, "navSupport")}</Link>
          <Link href="/privacy">{t(locale, "navPrivacy")}</Link>
          <Link href="/terms">{t(locale, "navTerms")}</Link>
          <span dir="ltr">© 2026 NAMAT</span>
        </div>
      </div>
    </footer>
  );
}
