import type { Metadata } from "next";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Terms" ar="الشروط" />
        </h1>
        <p>
          <Bi en="Summary of the commercial terms for NAMAT." ar="ملخص الشروط التجارية لنَمَط." />
        </p>
      </header>
      <div className="prose">
        <h2>
          <Bi en="License" ar="الترخيص" />
        </h2>
        <p>
          <Bi
            en="One-time purchase grants a personal lifetime entitlement to use NAMAT subject to these terms, device limits, and compatibility."
            ar="الشراء لمرة واحدة يمنح صلاحية دائمة على آيفون واحد لاستخدام نَمَط وفق هذه الشروط وحدود التوافق."
          />
        </p>
        <h2>
          <Bi en="Sideloading" ar="التثبيت الجانبي" />
        </h2>
        <p>
          <Bi
            en="You acknowledge the app is distributed outside the App Store and that you install it with a sideloading method you trust and keep signing valid. Unsigned test builds are not installable customer software."
            ar="تقر أن التطبيق يوزَّع خارج المتجر وأنك تثبته بطريقة تثق بها وتبقي التوقيع صالحاً. نسخ الاختبار غير الموقعة ليست برنامجاً قابلاً للتثبيت للعملاء."
          />
        </p>
        <h2>
          <Bi en="Compatibility" ar="التوافق" />
        </h2>
        <p>
          <Bi
            en="iOS and device support can change. NAMAT may remotely adjust compatibility or pause Apply. Artwork-only software is not a bank or payment processor for your cards."
            ar="دعم iOS والجهاز قد يتغير. قد يعدّل نَمَط التوافق عن بُعد أو يوقف التطبيق. البرنامج للشكل فقط وليس بنكاً أو معالجاً لبطاقاتك."
          />
        </p>
        <h2>
          <Bi en="Acceptable use" ar="الاستخدام المقبول" />
        </h2>
        <p>
          <Bi
            en="Do not attempt to extract Wallet secrets, attack NAMAT services, or use the product for fraud. AI generations must respect IP and trademark rules."
            ar="لا تحاول استخراج أسرار المحفظة أو مهاجمة خدمات نَمَط أو استخدام المنتج للاحتيال. توليد الذكاء يجب أن يحترم حقوق الملكية والعلامات."
          />
        </p>
      </div>
    </div>
  );
}
