import type { Metadata } from "next";
import { Bi } from "@/components/Copy";

export const metadata: Metadata = { title: "FAQ" };

const faqs = [
  {
    enQ: "Is this a subscription?",
    arQ: "هل هذا اشتراك دوري؟",
    enA: "No. NAMAT is a one-time purchase with lifetime entitlement for the product as offered, subject to device and iOS compatibility.",
    arA: "لا. نَمَط شراء لمرة واحدة مع صلاحية دائمة على آيفون واحد، وفق توافق الجهاز وiOS.",
  },
  {
    enQ: "How many iPhones can I use?",
    arQ: "كم آيفون يمكنني استخدامه؟",
    enA: "One active iPhone at a time. You can transfer activation from your account when you move to another iPhone.",
    arA: "آيفون واحد مفعّل في كل مرة. يمكنك نقل التفعيل من الحساب عندما تنتقل إلى آيفون آخر.",
  },
  {
    enQ: "Does NAMAT see my card numbers?",
    arQ: "هل يرى نَمَط أرقام بطاقتي؟",
    enA: "No. Wallet discovery and artwork changes stay on your iPhone. We never collect PAN, CVV, PIN, or Apple Pay tokens.",
    arA: "لا. اكتشاف المحفظة وتغيير الشكل يبقى على آيفون. لا نجمع رقم البطاقة ولا رمز الأمان ولا PIN ولا رموز Apple Pay.",
  },
  {
    enQ: "Is this banking software?",
    arQ: "هل هذا برنامج بنكي؟",
    enA: "No. NAMAT only customizes card artwork. It does not process payments for your bank, move money, or replace Apple Wallet.",
    arA: "لا. نَمَط يخصص شكل البطاقة فقط. لا يعالج دفعات بنكك ولا ينقل أموالاً ولا يستبدل Apple Wallet.",
  },
  {
    enQ: "Why sideload?",
    arQ: "لماذا التثبيت الجانبي؟",
    enA: "The app is not distributed through the App Store. You install a signed IPA with a sideloading workflow you trust.",
    arA: "التطبيق لا يوزَّع عبر متجر التطبيقات. تثبّت ملف IPA موقّعاً بطريقة تثق بها.",
  },
  {
    enQ: "What if iOS updates break Apply?",
    arQ: "ماذا لو كسر تحديث iOS التطبيق؟",
    enA: "Compatibility can change. We publish remote compatibility and may pause Apply via kill switch. Restore uses your on-device backup when still possible.",
    arA: "التوافق قد يتغير. ننشر التوافق عن بُعد وقد نوقف التطبيق بمفتاح الإيقاف. الاستعادة تستخدم النسخة على الجهاز عندما يبقى ذلك ممكناً.",
  },
];

export default function FaqPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Questions" ar="الأسئلة" />
        </h1>
        <p>
          <Bi en="Straight answers about purchase, privacy, and installation." ar="إجابات مباشرة عن الشراء والخصوصية والتثبيت." />
        </p>
      </header>
      <div className="faq" style={{ maxWidth: "42rem" }}>
        {faqs.map((item) => (
          <details key={item.enQ}>
            <summary>
              <Bi en={item.enQ} ar={item.arQ} />
            </summary>
            <p>
              <Bi en={item.enA} ar={item.arA} />
            </p>
          </details>
        ))}
      </div>
    </div>
  );
}
