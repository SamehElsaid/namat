import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@namat/ui";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "How it works" };

const steps = [
  {
    enTitle: "Check compatibility",
    arTitle: "تحقق من التوافق",
    enBody: "Confirm your iPhone and iOS version are supported before you buy.",
    arBody: "تأكد أن آيفون وإصدار iOS مدعومان قبل الشراء.",
  },
  {
    enTitle: "Buy once",
    arTitle: "اشترِ مرة واحدة",
    enBody: "One purchase gives lifetime access on one iPhone at a time. You can move it later.",
    arBody: "شراء لمرة واحدة يمنح صلاحية دائمة على آيفون واحد في كل مرة. يمكنك نقل التفعيل لاحقًا.",
  },
  {
    enTitle: "Install the app",
    arTitle: "ثبّت التطبيق",
    enBody: "Download the IPA and sideload with your preferred trusted installer.",
    arBody: "نزّل ملف IPA وثبّته بأداة التثبيت الجانبي التي تثق بها.",
  },
  {
    enTitle: "Apply artwork",
    arTitle: "طبّق الشكل",
    enBody: "Choose your photo or a NAMAT design, preview it on the card, then apply. The original look stays on this iPhone and can be restored.",
    arBody: "اختر صورتك أو تصميمًا من نَمَط، عاينه على البطاقة، ثم طبّقه. الشكل الأصلي يبقى على هذا الآيفون ويمكن استعادته.",
  },
];

export default function HowItWorksPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="How it works" ar="كيف يعمل" />
        </h1>
        <p>
          <Bi
            en="NAMAT changes only the visual artwork of supported Apple Wallet payment cards. Discovery, apply, and restore stay on your iPhone."
            ar="نَمَط يغيّر الشكل البصري فقط لبطاقات Apple Wallet المدعومة. الاكتشاف والتطبيق والاستعادة تبقى على آيفون."
          />
        </p>
      </header>
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="steps">
          {steps.map((s, index) => (
            <article className="step" key={s.enTitle}>
              <span className="number">{String(index + 1).padStart(2, "0")}</span>
              <h3>
                <Bi en={s.enTitle} ar={s.arTitle} />
              </h3>
              <p>
                <Bi en={s.enBody} ar={s.arBody} />
              </p>
            </article>
          ))}
        </div>
        <div className="cta-row" style={{ marginTop: "2.5rem" }}>
          <Link href="/compatibility">
            <Button size="lg">
              <Bi en="Check compatibility" ar="تحقق من التوافق" />
            </Button>
          </Link>
          <Link href="/pricing">
            <Button size="lg" variant="secondary">
              <Bi en="View pricing" ar="عرض السعر" />
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
