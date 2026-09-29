"use client";

import { ctaOutline, ctaPrimary } from "@/components/landing/cta";
import { useLandingCta } from "@/components/landing/useLandingCta";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function HeroCTAButtons() {
  const t = useTranslations("landing");
  const { hrefFor } = useLandingCta();

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Link href={hrefFor("speaker")} className={ctaPrimary}>
        {t("ctaSpeak")}
      </Link>
      <Link href={hrefFor("listener")} className={ctaOutline}>
        {t("ctaListen")}
      </Link>
    </div>
  );
}
