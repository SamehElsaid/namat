import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@namat/ui";
import { Bi } from "@/components/Copy";
import { SupportRequests } from "@/components/SupportRequests";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Support" ar="الدعم" />
        </h1>
        <p>
          <Bi en="Installation, activation, and compatibility help." ar="مساعدة التثبيت والتفعيل والتوافق." />
        </p>
      </header>
      <div className="prose">
        <p>
          <Bi
            en="Email support with your account email, app version, and iOS version. Never include card numbers, CVV, PIN, or screenshots that show a full card number."
            ar="راسل الدعم ببريد الحساب وإصدار التطبيق وiOS. لا تُضمّن أرقام البطاقة أو رمز الأمان أو PIN أو لقطات تظهر الرقم كاملاً."
          />{" "}
          <a href="mailto:support@namat.shara.sa">support@namat.shara.sa</a>
        </p>
        <p>
          <Link href="/install">
            <Bi en="Install" ar="التثبيت" />
          </Link>
          {" · "}
          <Link href="/compatibility">
            <Bi en="Compatibility" ar="التوافق" />
          </Link>
          {" · "}
          <Link href="/faq">
            <Bi en="FAQ" ar="الأسئلة" />
          </Link>
          {" · "}
          <Link href="/account">
            <Bi en="Account" ar="الحساب" />
          </Link>
        </p>
        <div className="cta-row" style={{ marginTop: "1.5rem" }}>
          <Link href="/account">
            <Button size="lg">
              <Bi en="Open account" ar="فتح الحساب" />
            </Button>
          </Link>
        </div>
      </div>
      <SupportRequests />
    </div>
  );
}
