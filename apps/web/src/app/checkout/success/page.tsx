import Link from "next/link";
import { Button } from "@namat/ui";
import { Bi } from "@/components/Copy";

export const metadata = { title: "Checkout" };

export default function CheckoutSuccessPage() {
  return (
    <div className="container">
      <header className="page-hero">
        <h1>
          <Bi en="Payment is not confirmed here" ar="لم يتم تأكيد الدفع من هذه الصفحة" />
        </h1>
        <p>
          <Bi
            en="Leaving the payment page does not confirm or cancel a purchase. Open your account to see the verified result."
            ar="مغادرة صفحة الدفع لا تؤكد الشراء ولا تلغيه. افتح الحساب لرؤية النتيجة المتحققة."
          />
        </p>
      </header>
      <Link href="/account">
        <Button>
          <Bi en="Account" ar="الحساب" />
        </Button>
      </Link>
    </div>
  );
}
