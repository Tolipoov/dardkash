import SiteFooter from "@/components/landing/SiteFooter";
import SiteHeader from "@/components/landing/SiteHeader";
import { ToastProvider } from "@/components/ui/Toast";
import { locales } from "@/i18n/config";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, setRequestLocale } from "next-intl/server";
import { Manrope, PT_Serif } from "next/font/google";
import type { ReactNode } from "react";
import "../globals.css";

const ptSerif = PT_Serif({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "700"],
  variable: "--font-fraunces",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export const metadata = {
  title: "Dardkash — sizni tinglashga tayyor odam bor",
  description:
    "Dardkash sizni hukm qilmasdan tinglaydigan odam bilan video, audio yoki yozishma orqali bog'laydi.",
};

export default async function LocaleLayout({
  children,
  params: { locale },
}: {
  children: ReactNode;
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html lang={locale} className={`${ptSerif.variable} ${manrope.variable}`}>
      <body className="font-sans antialiased grid min-h-screen grid-rows-[auto_1fr_auto]">
        <NextIntlClientProvider messages={messages} locale={locale}>
          <ToastProvider>
            <SiteHeader />
            <main>{children}</main>
            <SiteFooter />
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
