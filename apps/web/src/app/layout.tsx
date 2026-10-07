import type { Metadata } from "next";
import { DesignMotion } from "@/components/DesignMotion";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "نَمَط — بطاقتك، بطابعك",
    template: "%s · نَمَط",
  },
  description:
    "اكتشف نَمَط لتخصيص مظهر بطاقة Apple Wallet. جرّب التصاميم وتعرّف على خطوات الاستخدام.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://namat.shara.sa",
  ),
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="site-shell">
          <SiteHeader />
          <main className="site-main">{children}</main>
          <SiteFooter />
          <DesignMotion />
        </div>
      </body>
    </html>
  );
}
