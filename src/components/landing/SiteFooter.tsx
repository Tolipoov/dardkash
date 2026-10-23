import { Link } from "@/i18n/navigation";
import { Info, Send } from "lucide-react";
import { useTranslations } from "next-intl";

// Sayt yorug' "tosh" fonida — avvalgi qop-qora blok keskin ajralib turardi.
// Endi brend ustuni + ikkita havolalar ustuni, telefonda havolalar yonma-yon.
export default function SiteFooter() {
  const t = useTranslations("landing");
  const tNav = useTranslations("nav");
  const tTerms = useTranslations("terms");
  const tPrivacy = useTranslations("privacy");
  const tGuide = useTranslations("guide");
  const tLetters = useTranslations("letters");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const headingClass = "text-xs font-semibold uppercase tracking-wider text-kul/45";
  const linkClass = "text-sm text-kul/75 transition-colors hover:text-barg";

  return (
    <footer className="border-t border-kul/10 bg-sahar-dim text-kul">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-6 py-12 md:grid-cols-[1.6fr_1fr_1fr]">
        <div className="col-span-2 md:col-span-1">
          <Link href="/" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.svg" alt="Dardkash" className="h-7 w-auto" />
          </Link>
          <p className="mt-4 max-w-sm font-display text-lg leading-snug text-kul/80">
            {t("footerTagline")}
          </p>
          <p className="mt-5 flex max-w-sm items-start gap-2 rounded-2xl border border-kul/10 bg-white/50 px-4 py-3 text-xs leading-relaxed text-kul/65">
            <Info size={16} className="mt-px shrink-0 text-yulduz" aria-hidden />
            {t("footerNote")}
          </p>
        </div>

        <nav aria-label={t("footerPlatform")}>
          <p className={headingClass}>{t("footerPlatform")}</p>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/#how" className={linkClass}>
                {tNav("howItWorks")}
              </Link>
            </li>
            <li>
              <Link href="/onboarding?role=listener" className={linkClass}>
                {tNav("becomeListener")}
              </Link>
            </li>
            <li>
              <Link href="/letters" className={linkClass}>
                {tLetters("dashboardWrite")}
              </Link>
            </li>
            <li>
              <Link href="/guide" className={linkClass}>
                {tGuide("pageTitle")}
              </Link>
            </li>
          </ul>
        </nav>

        <nav aria-label={t("footerInfo")}>
          <p className={headingClass}>{t("footerInfo")}</p>
          <ul className="mt-4 space-y-3">
            <li>
              <Link href="/terms" className={linkClass}>
                {tTerms("pageTitle")}
              </Link>
            </li>
            <li>
              <Link href="/privacy" className={linkClass}>
                {tPrivacy("pageTitle")}
              </Link>
            </li>
            {botUsername && (
              <li>
                <a
                  href={`https://t.me/${botUsername}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 ${linkClass}`}
                >
                  <Send size={14} aria-hidden />
                  {t("footerTelegram")}
                </a>
              </li>
            )}
          </ul>
        </nav>
      </div>

      <div className="border-t border-kul/10">
        <p className="mx-auto max-w-6xl px-6 py-5 text-center text-xs text-kul/50 sm:text-left">
          © {new Date().getFullYear()} Dardkash.uz. {t("allRightsReserved")}
        </p>
      </div>
    </footer>
  );
}
