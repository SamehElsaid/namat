import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "NAMAT Admin",
    template: "%s · NAMAT Admin",
  },
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Arabic-first to match the NAMAT brand; the in-app toggle switches dir/lang
  // at runtime (see AdminShell / locale).
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
