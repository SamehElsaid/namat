import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@namat/ui";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "Install" };

export default function InstallPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Install" ar="التثبيت" />
        </h1>
        <p>
          <Bi
            en="After purchase, sign in and set up this iPhone from your account. NAMAT registers the iPhone and prepares installation. Do not send a device code by message or email."
            ar="بعد الشراء سجّل الدخول وأعد هذا iPhone من حسابك. يسجّل NAMAT الجهاز ويجهّز التثبيت. لا ترسل رمز الجهاز برسالة أو بريد."
          />
        </p>
      </header>
      <div className="steps" style={{ marginBottom: "28px" }}>
        <article className="step">
          <span className="number">01</span>
          <h3>
            <Bi en="Sign in" ar="سجّل الدخول" />
          </h3>
          <p>
            <Bi
              en="Continue with Google, or use email if you prefer."
              ar="تابع باستخدام Google، أو ادخل بالبريد الإلكتروني."
            />
          </p>
        </article>
        <article className="step">
          <span className="number">02</span>
          <h3>
            <Bi en="Register this iPhone" ar="تسجيل هذا iPhone" />
          </h3>
          <p>
            <Bi
              en="Open Set up this iPhone in Safari. NAMAT downloads a registration profile, and this iPhone returns only the identifier needed to prepare installation."
              ar="افتح إعداد جهازك في Safari. ينزّل NAMAT ملف التسجيل، ويعيد هذا iPhone المعرّف اللازم لتجهيز التثبيت فقط."
            />
          </p>
        </article>
        <article className="step">
          <span className="number">03</span>
          <h3>
            <Bi en="Install and open NAMAT" ar="ثبّت وافتح NAMAT" />
          </h3>
          <p>
            <Bi
              en="When the app is ready, install it from the same page, then open NAMAT. A purchase activates one iPhone at a time."
              ar="عندما يصبح التطبيق جاهزًا، ثبّته من الصفحة نفسها ثم افتح نَمَط. الشراء يفعّل آيفونًا واحدًا في كل مرة."
            />
          </p>
        </article>
        <article className="step">
          <span className="number">04</span>
          <h3>
            <Bi en="Finish setup and apply" ar="أكمل الإعداد وطبّق" />
          </h3>
          <p>
            <Bi
              en="Finish device setup on this iPhone, choose a photo or a NAMAT design, then apply. The original look is saved on the iPhone before the first change."
              ar="أكمل إعداد هذا الآيفون، اختر صورة أو تصميمًا من نَمَط، ثم طبّق. يُحفظ الشكل الأصلي على الآيفون قبل أول تغيير."
            />
          </p>
        </article>
      </div>
      <div className="prose">
        <div className="notice" style={{ marginTop: "1.5rem" }}>
          <Bi
            en="IPA links and checksums appear in your account after entitlement is active. Need help? Visit Support."
            ar="روابط التثبيت تظهر في حسابك بعد تفعيل نَمَط. تحتاج مساعدة؟ زر الدعم."
          />
        </div>
        <div className="cta-row" style={{ marginTop: "2rem" }}>
          <Link href="/account/install">
            <Button size="lg">
              <Bi en="Set up this iPhone" ar="إعداد جهازك" />
            </Button>
          </Link>
          <Link href="/support">
            <Button size="lg" variant="secondary">
              <Bi en="Get support" ar="الحصول على الدعم" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
