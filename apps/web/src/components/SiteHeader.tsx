"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LocaleSwitch, t, useLocale } from "./LocaleSwitch";
import { getStoredToken } from "@/lib/session";

export function SiteHeader() {
  const [locale] = useLocale();
  const [scrolled, setScrolled] = useState(false);
  const [signedIn, setSignedIn] = useState(false);

  useEffect(() => {
    setSignedIn(getStoredToken() === "cookie");
    let scheduled = false;
    const update = () => {
      setScrolled(window.scrollY > 20);
      scheduled = false;
    };
    const onScroll = () => {
      if (scheduled) return;
      scheduled = true;
      requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className={scrolled ? "site-header scrolled" : "site-header"}>
      <Link href="/" className="brand" aria-label={t(locale, "navHome")}>
        {locale === "ar" ? "نَمَط" : "NAMAT"}
        <span>{locale === "ar" ? "NAMAT" : "نَمَط"}</span>
      </Link>
      <nav className="nav-links" aria-label="Primary">
        <Link className="nav-quiet" href="/#designs">
          {t(locale, "navDesigns")}
        </Link>
        <Link className="nav-quiet" href="/how-it-works">
          {t(locale, "navHow")}
        </Link>
        <Link className="nav-quiet" href="/faq">
          {t(locale, "navFaq")}
        </Link>
        <Link className="nav-quiet" href="/install">
          {t(locale, "navInstall")}
        </Link>
        <Link className="nav-keep" href={signedIn ? "/account" : "/login"}>
          {signedIn ? t(locale, "navAccount") : t(locale, "navLogin")}
        </Link>
        <LocaleSwitch />
        <Link className="navbtn" href="/#designs">
          {t(locale, "navTry")}
        </Link>
      </nav>
    </header>
  );
}
