import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations("landing");
  const tTerms = useTranslations("terms");
  const tPrivacy = useTranslations("privacy");

  return (
    <footer className="bg-tun-deep text-sahar/70">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm">
        <p className="max-w-lg">{t("footerNote")}</p>
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sahar/60">
          <Link href="/terms" className="hover:text-sahar">
            {tTerms("pageTitle")}
          </Link>
          <Link href="/privacy" className="hover:text-sahar">
            {tPrivacy("pageTitle")}
          </Link>
        </div>
        <p className="mt-4 text-sahar/40">© {new Date().getFullYear()} Dardkash.uz</p>
      </div>
    </footer>
  );
}
