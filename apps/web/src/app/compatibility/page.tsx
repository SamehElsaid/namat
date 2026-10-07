import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@namat/ui";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "Compatibility" };

export default function CompatibilityPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Compatibility" ar="التوافق" />
        </h1>
        <p>
          <Bi
            en="NAMAT relies on local Wallet tooling that can change with iOS updates. Support is versioned remotely and may expand or retract."
            ar="يعتمد نَمَط على أدوات المحفظة المحلية التي قد تتغير مع تحديثات iOS. الدعم يُحدَّث عن بُعد وقد يتسع أو يضيق."
          />
        </p>
      </header>
      <div className="prose">
        <h2>
          <Bi en="Current guidance" ar="الإرشاد الحالي" />
        </h2>
        <ul>
          <li>
            <Bi en="iPhone required (not iPad / Mac)." ar="يلزم آيفون (ليس آيباد أو ماك)." />
          </li>
          <li>
            <Bi
              en="Supported iOS versions are published by NAMAT and refreshed remotely."
              ar="إصدارات iOS المدعومة ينشرها نَمَط وتُحدَّث عن بُعد."
            />
          </li>
          <li>
            <Bi
              en="Not every bank card appearance may be customizable."
              ar="ليس كل مظهر بطاقة بنكية قابلاً للتخصيص."
            />
          </li>
          <li>
            <Bi
              en="Sideloading is required — this is not an App Store install."
              ar="التثبيت الجانبي مطلوب — هذا ليس تثبيتاً من متجر التطبيقات."
            />
          </li>
        </ul>
        <h2>
          <Bi en="What we never touch" ar="ما لا نلمسه أبداً" />
        </h2>
        <p>
          <Bi
            en="Card numbers, CVV, PIN, bank credentials, and Apple Pay tokens stay on your device. NAMAT servers never receive them."
            ar="أرقام البطاقة ورمز الأمان ورقم PIN وبيانات البنك ورموز Apple Pay تبقى على جهازك. خوادم نَمَط لا تستقبلها."
          />
        </p>
        <div className="notice warn" style={{ marginTop: "1.5rem" }}>
          <Bi
            en="iOS support can change after system updates. If Apply becomes unavailable, Restore remains the path to return original artwork when the device still allows it."
            ar="دعم iOS قد يتغير بعد تحديثات النظام. إذا تعذر التطبيق، تبقى الاستعادة طريق الرجوع إلى الشكل الأصلي عندما يسمح الجهاز بذلك."
          />
        </div>
        <div className="cta-row" style={{ marginTop: "2rem" }}>
          <Link href="/install">
            <Button size="lg">
              <Bi en="Install guide" ar="دليل التثبيت" />
            </Button>
          </Link>
          <Link href="/checkout">
            <Button size="lg" variant="secondary">
              <Bi en="Continue to buy" ar="المتابعة للشراء" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
