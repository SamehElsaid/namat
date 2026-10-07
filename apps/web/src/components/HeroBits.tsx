"use client";

import Link from "next/link";
import { Button } from "@namat/ui";
import { useTx } from "./Copy";

export function WalletHeroVisual() {
  return (
    <div className="wallet-stage" aria-hidden="true">
      <div className="wallet-card">
        <div className="chip" />
        <div className="mark">NAMAT</div>
        <div className="ar-mark">نَمَط</div>
      </div>
    </div>
  );
}

export function CtaGroup({
  primaryHref = "/checkout",
  primaryLabel,
  secondaryHref = "/how-it-works",
  secondaryLabel,
}: {
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  const tx = useTx();
  return (
    <div className="cta-row">
      <Link href={primaryHref}>
        <Button size="lg">{primaryLabel ?? tx("Buy once", "اشترِ مرة واحدة")}</Button>
      </Link>
      <Link href={secondaryHref}>
        <Button size="lg" variant="secondary">
          {secondaryLabel ?? tx("See how it works", "كيف يعمل")}
        </Button>
      </Link>
    </div>
  );
}
