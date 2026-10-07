import Link from "next/link";
import { Bi } from "@/components/Copy";
import { SkinStudio } from "@/components/SkinStudio";

export default function HomePage() {
  return (
    <>
      <section className="hero">
        <div>
          <div className="eyebrow">
            <Bi en="NAMAT for Apple Wallet" ar="نَمَط لـ Apple Wallet" />
          </div>
          <h1>
            <Bi en="Your card." ar="بطاقتك." />
            <br />
            <em>
              <Bi en="Make it yours." ar="غيّرها على ذوقك." />
            </em>
          </h1>
          <p className="intro">
            <Bi
              en="Change the artwork on your supported Apple Wallet card. Choose a look, preview it on the card, and apply it. The original stays available to restore."
              ar="غيّر صورة بطاقتك المدعومة في Apple Wallet. اختر صورة من ذوقك، عاينها على البطاقة، وطبّقها. والأصل محفوظ للعودة إليه."
            />
          </p>
          <div className="actions">
            <a className="primary" href="#designs">
              <Bi en="Try the designs" ar="جرّب التصاميم" />
            </a>
            <a href="#how" className="small">
              <Bi en="See the steps" ar="تعرّف على الخطوات" />
            </a>
          </div>
        </div>
        <SkinStudio />
      </section>
      <div className="strip">
        <span>
          <Bi en="One-time purchase" ar="شراء لمرة واحدة" />
        </span>
        <span>
          <Bi en="One iPhone" ar="آيفون واحد" />
        </span>
        <span>
          <Bi en="Swappable designs" ar="تصاميم قابلة للتبديل" />
        </span>
        <span>
          <Bi en="Restore the original look" ar="استعادة المظهر الأصلي" />
        </span>
      </div>
      <section className="section" id="how">
        <div className="headingrow">
          <div>
            <span className="sectiontag">THE PROCESS / 02</span>
            <h2>
              <Bi en="Change your card’s look" ar="غيّر مظهر بطاقتك" />
              <br />
              <Bi en="in a few steps." ar="بخطوات بسيطة." />
            </h2>
          </div>
          <p>
            <Bi
              en="Start with compatibility. Set the app up once, then switch designs from your iPhone."
              ar="ابدأ بالتوافق. جهّز التطبيق مرة واحدة، ثم بدّل التصاميم من آيفون."
            />
          </p>
        </div>
        <div className="steps">
          <article className="step">
            <span className="number">01</span>
            <h3>
              <Bi en="Check compatibility." ar="تحقق من التوافق." />
            </h3>
            <p>
              <Bi
                en="Confirm the iPhone model, the iOS version, and the card you want to change before you buy."
                ar="تأكد من دعم طراز آيفون وإصدار iOS والبطاقة التي تريد تغيير مظهرها، قبل أي شراء."
              />
            </p>
            <Link href="/compatibility">
              <Bi en="Check your device" ar="تحقق من جهازك" />
            </Link>
          </article>
          <article className="step">
            <span className="number">02</span>
            <h3>
              <Bi en="Buy once." ar="اشترِ مرة واحدة." />
            </h3>
            <p>
              <Bi
                en="One purchase gives your account lifetime access on one active iPhone."
                ar="شراء واحد يمنح حسابك صلاحية دائمة على آيفون واحد مفعّل."
              />
            </p>
          </article>
          <article className="step">
            <span className="number">03</span>
            <h3>
              <Bi en="Install NAMAT." ar="ثبّت نَمَط." />
            </h3>
            <p>
              <Bi
                en="Follow the install guide and finish setting up this iPhone. The guide tells you when Developer Mode and pairing are needed."
                ar="اتبع دليل التثبيت وإعداد آيفون. يوضح لك الدليل متى تحتاج إلى تفعيل وضع المطوّر وإكمال الاقتران."
              />
            </p>
          </article>
          <article className="step">
            <span className="number">04</span>
            <h3>
              <Bi en="Choose an image and apply it." ar="اختر الصورة وطبّقها." />
            </h3>
            <p>
              <Bi
                en="In the NAMAT app on iPhone, choose your card and preview the design. A copy of the original is saved before the change so you can restore it."
                ar="داخل تطبيق نَمَط على آيفون، اختر بطاقتك وعاين التصميم. تُحفظ نسخة من الأصل قبل التغيير لتتمكن من استعادته."
              />
            </p>
          </article>
        </div>
      </section>
      <section className="restore">
        <div>
          <h2>
            <Bi en="Switch the design." ar="بدّل التصميم." />
            <br />
            <Bi en="Or restore the original." ar="أو استعد الأصل." />
          </h2>
          <p>
            <Bi
              en="The app saves a copy of the original look before the first change. Move between designs, and return to the original from the app whenever you want."
              ar="يحفظ التطبيق نسخة من المظهر الأصلي قبل أول تغيير. تنقّل بين التصاميم، وارجع إلى الأصل من التطبيق متى أردت."
            />
          </p>
        </div>
        <span className="stamp">ORIGINAL → NAMAT → ORIGINAL</span>
      </section>
      <section className="section faq" id="faq">
        <div>
          <span className="sectiontag">GOOD TO KNOW / 03</span>
          <h2>
            <Bi en="Clear questions." ar="أسئلة واضحة." />
            <br />
            <Bi en="Short answers." ar="إجابات مختصرة." />
          </h2>
        </div>
        <div>
          <details open>
            <summary>
              <Bi
                en="Does NAMAT change the card or its artwork?"
                ar="هل نَمَط يغيّر البطاقة أم صورتها؟"
              />
            </summary>
            <p>
              <Bi
                en="NAMAT changes the artwork shown on a supported card inside Apple Wallet. Choose a design, preview it, and apply it from iPhone. The service does not issue a new bank card."
                ar="نَمَط يغيّر الصورة الظاهرة على البطاقة المدعومة داخل Apple Wallet. اختر التصميم وعاينه وطبّقه من آيفون؛ لا تصدر الخدمة بطاقة بنكية جديدة."
              />
            </p>
          </details>
          <details>
            <summary>
              <Bi en="Do I need a monthly subscription?" ar="هل أحتاج اشتراكًا شهريًا؟" />
            </summary>
            <p>
              <Bi
                en="NAMAT is a one-time purchase with lifetime access on one iPhone per account."
                ar="نموذج نَمَط هو شراء لمرة واحدة بصلاحية دائمة، على آيفون واحد لكل حساب."
              />
            </p>
          </details>
          <details>
            <summary>
              <Bi en="Can I restore the original design?" ar="هل أستطيع استعادة التصميم الأصلي؟" />
            </summary>
            <p>
              <Bi
                en="Yes. The app saves the original look before any design is applied, so you can restore it."
                ar="نعم، يعتمد التطبيق على حفظ المظهر الأصلي قبل تطبيق أي تصميم، لتتمكن من استعادته."
              />
            </p>
          </details>
          <details>
            <summary>
              <Bi en="How do I know if my device is supported?" ar="كيف أعرف إن كان جهازي مدعومًا؟" />
            </summary>
            <p>
              <Bi
                en="Check the compatibility page before you buy. Support depends on the device, the iOS version, and the card. Not every iPhone is supported automatically."
                ar="راجع صفحة التوافق في موقع نَمَط قبل الشراء. الدعم يعتمد على الجهاز وإصدار iOS والبطاقة، وليس كل آيفون مدعومًا تلقائيًا."
              />
            </p>
          </details>
        </div>
      </section>
      <section className="section privacy" id="privacy">
        <span className="sectiontag">
          <Bi en="Privacy" ar="الخصوصية" />
        </span>
        <h2>
          <Bi en="Your card data" ar="بيانات بطاقتك" />
          <br />
          <Bi en="stays yours." ar="تبقى لك." />
        </h2>
        <p>
          <Bi
            en="Choosing an image, previewing it, applying it, and restoring the original happen inside the NAMAT app on iPhone. Card artwork stays on your device. We do not ask for your bank card number or PIN."
            ar="اختيار الصورة ومعاينتها وتطبيقها واستعادة الأصل تتم داخل تطبيق نَمَط على آيفون. تبقى معالجة مظهر البطاقة على جهازك، ولا نطلب منك إدخال رقم البطاقة البنكية أو رمزها السري."
          />
        </p>
      </section>
    </>
  );
}
