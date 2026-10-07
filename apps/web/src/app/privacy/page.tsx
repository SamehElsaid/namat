import type { Metadata } from "next";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Privacy" ar="الخصوصية" />
        </h1>
        <p>
          <Bi en="What NAMAT collects — and what it never will." ar="ما يجمعه نَمَط — وما لن يجمعه." />
        </p>
      </header>
      <div className="prose">
        <h2>
          <Bi en="On-device Wallet data" ar="بيانات المحفظة على الجهاز" />
        </h2>
        <p>
          <Bi
            en="Card numbers, CVV, PIN, bank credentials, Apple Pay tokens, and Wallet card identifiers stay on your iPhone. Apply and Restore do not upload them to NAMAT."
            ar="أرقام البطاقة ورمز الأمان وPIN وبيانات البنك ورموز Apple Pay ومعرّفات بطاقات المحفظة تبقى على آيفون. التطبيق والاستعادة لا يرفعانها إلى نَمَط."
          />
        </p>
        <h2>
          <Bi en="Account data" ar="بيانات الحساب" />
        </h2>
        <p>
          <Bi
            en="We store your email, purchase and entitlement records, NAMAT installation IDs, coarse app and iOS versions, and non-sensitive operational events needed to run the product."
            ar="نخزن بريدك وسجلات الشراء والتفعيل ومعرّفات تثبيت نَمَط وإصدارات التطبيق وiOS التقريبية وأحداث تشغيل غير حساسة لازمة لتشغيل المنتج."
          />
        </p>
        <h2>
          <Bi en="AI Skin Studio" ar="استوديو الذكاء" />
        </h2>
        <p>
          <Bi
            en="Prompts and generated artwork may be processed for the AI feature. Wallet discovery output is never sent to AI services. Prompts that contain card numbers or Wallet identifiers are rejected."
            ar="قد تُعالج الأوصاف والصور المولدة لميزة الذكاء. مخرجات اكتشاف المحفظة لا تُرسل إلى خدمات الذكاء. الأوصاف التي تحتوي أرقام بطاقات أو معرّفات محفظة تُرفض."
          />
        </p>
        <h2>
          <Bi en="Contact" ar="التواصل" />
        </h2>
        <p>
          <Bi en="Privacy questions: " ar="أسئلة الخصوصية: " />
          <a href="mailto:privacy@namat.shara.sa">privacy@namat.shara.sa</a>
        </p>
      </div>
    </div>
  );
}
