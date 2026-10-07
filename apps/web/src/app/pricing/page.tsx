"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@namat/ui";
import { NAMAT_PRICE_SAR, type NamatPackage } from "@namat/shared";
import { Bi, useTx } from "@/components/Copy";
import { api } from "@/lib/api";

function priceMajor(minor: number): string {
  return (minor / 100).toFixed(2).replace(/\.00$/, "");
}

export default function PricingPage() {
  const tx = useTx();
  const [packages, setPackages] = useState<NamatPackage[] | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const res = await api.packages();
        setPackages(res.packages ?? []);
      } catch {
        setPackages([]);
      }
    })();
  }, []);

  const multi = (packages?.length ?? 0) > 1;

  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Pricing" ar="السعر" />
        </h1>
        <p>
          <Bi
            en="One purchase. Lifetime access. One iPhone."
            ar="شراء واحد. صلاحية دائمة. آيفون واحد."
          />
        </p>
      </header>

      {packages && packages.length > 0 ? (
        <div
          style={{
            display: "grid",
            gap: "1.25rem",
            gridTemplateColumns: multi ? "repeat(auto-fit, minmax(16rem, 1fr))" : "minmax(0, 36rem)",
            marginBottom: "2rem",
          }}
        >
          {packages.map((p) => {
            const title = tx(p.nameEn, p.nameAr);
            const href = `/checkout?package=${encodeURIComponent(p.code)}`;
            return (
              <div key={p.id} className="panel" style={{ padding: "1.5rem" }}>
                <h2 style={{ marginTop: 0 }}>{title}</h2>
                <div className="price-figure">
                  {priceMajor(p.priceMinor)} {p.currency}
                </div>
                <p className="price-note">
                  {p.durationDays == null ? (
                    <Bi en="One-time purchase · lifetime access" ar="شراء لمرة واحدة · صلاحية دائمة" />
                  ) : (
                    tx(`Access for ${p.durationDays} days`, `صلاحية لمدة ${p.durationDays} يوم`)
                  )}
                  {" · "}
                  {p.maxDevices > 1
                    ? tx(`${p.maxDevices} iPhones`, `${p.maxDevices} أجهزة آيفون`)
                    : tx("one iPhone", "آيفون واحد")}
                </p>
                <div style={{ marginTop: "1.25rem" }}>
                  <Link href={href}>
                    <Button size="lg">
                      <Bi en="Continue to checkout" ar="المتابعة للدفع" />
                    </Button>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ maxWidth: "36rem" }}>
          <div className="price-figure">{NAMAT_PRICE_SAR} SAR</div>
          <p className="price-note">
            <Bi
              en="One-time purchase · lifetime access · one iPhone"
              ar="شراء لمرة واحدة · صلاحية دائمة · آيفون واحد"
            />
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Link href="/checkout">
              <Button size="lg">
                <Bi en="Continue to checkout" ar="المتابعة للدفع" />
              </Button>
            </Link>
          </div>
        </div>
      )}

      <div style={{ maxWidth: "36rem" }}>
        <ul className="prose">
          <li>
            <Bi
              en="Full access to the NAMAT iOS app while your device remains supported"
              ar="وصول كامل لتطبيق نَمَط على iOS ما دام جهازك مدعوماً"
            />
          </li>
          <li>
            <Bi
              en="Dynamic design library updates without a new purchase"
              ar="تحديثات مكتبة التصاميم دون شراء جديد"
            />
          </li>
          <li>
            <Bi en="Local Apply / Restore for supported Wallet cards" ar="تطبيق واستعادة محليان للبطاقات المدعومة" />
          </li>
        </ul>
        <div className="notice warn" style={{ marginTop: "1.5rem" }}>
          <strong style={{ color: "var(--namat-ink)" }}>
            <Bi en="Please know before buying" ar="اعرف هذا قبل الشراء" />
          </strong>
          <ul style={{ margin: "0.6rem 0 0", paddingInlineStart: "1.1rem" }}>
            <li>
              <Bi en="Installation requires sideloading an IPA (not App Store)." ar="التثبيت يتطلب ملف IPA جانبياً (ليس من المتجر)." />
            </li>
            <li>
              <Bi
                en="iOS support can change; Apply may be paused remotely if needed."
                ar="دعم iOS قد يتغير؛ قد يُوقف التطبيق عن بُعد عند الحاجة."
              />
            </li>
            <li>
              <Bi
                en="NAMAT is artwork-only — not banking, not Apple Pay processing."
                ar="نَمَط للشكل فقط — ليس بنكاً وليس معالجة Apple Pay."
              />
            </li>
            <li>
              <Bi
                en="Checkout uses Moyasar. Without live merchant keys it stays in test mode and does not grant a production entitlement."
                ar="الدفع عبر ميسر. بدون مفاتيح تاجر فعلية يبقى في الوضع التجريبي ولا يمنح تفعيل إنتاج."
              />
            </li>
          </ul>
        </div>
        <div className="cta-row" style={{ marginTop: "2rem" }}>
          <Link href="/compatibility">
            <Button size="lg" variant="secondary">
              <Bi en="Compatibility" ar="التوافق" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
