import { useTranslations } from "next-intl";

export default function SiteFooter() {
  const t = useTranslations("landing");

  return (
    <footer className="bg-tun-deep text-sahar/70">
      <div className="mx-auto max-w-6xl px-6 py-10 text-sm">
        <p className="max-w-lg">{t("footerNote")}</p>
        <p className="mt-4 text-sahar/40">© {new Date().getFullYear()} Dardkash.uz</p>
      </div>
    </footer>
  );
}
