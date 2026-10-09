import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations("landing");
  const tTerms = useTranslations("terms");
  const tPrivacy = useTranslations("privacy");

  return (
    <footer className="bg-tun-deep text-sahar/70">
      <div className="mx-auto max-w-6xl px-6 py-8 text-center text-xs sm:py-10 sm:text-left sm:text-sm">
        <p className="mx-auto max-w-lg sm:mx-0">{t("footerNote")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sahar/60 sm:mt-5 sm:justify-start">
          <Link href="/terms" className="hover:text-sahar">
            {tTerms("pageTitle")}
          </Link>
          <Link href="/privacy" className="hover:text-sahar">
            {tPrivacy("pageTitle")}
          </Link>
        </div>
        <p className="mt-4 text-sahar/40">
          © {new Date().getFullYear()} Dardkash.uz. {t("allRightsReserved")}
        </p>
      </div>
    </footer>
  );
}
