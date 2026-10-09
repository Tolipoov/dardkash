"use client";

import { ctaOnDark, ctaOutlineOnDark } from "@/components/landing/cta";
import { useLandingCta } from "@/components/landing/useLandingCta";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function FinalCta() {
  const t = useTranslations("landing");
  const { hrefFor } = useLandingCta();

  return (
    <section className="mx-auto max-w-6xl px-4 pb-18">
      <div className="relative overflow-hidden rounded-[48px] bg-barg px-8 py-20 text-sahar md:px-18">
        <div aria-hidden="true" className="absolute -right-20 -top-20 size-80 rounded-full bg-sahar/8" />
        <div aria-hidden="true" className="absolute -bottom-30 right-35 size-[220px] rounded-full bg-yulduz/35" />
        <h2 className="relative mb-9 max-w-[640px] font-display text-[26px] leading-[1.2] md:text-[44px]">
          {t("finalCtaTitle")}
        </h2>
        <div className="relative flex flex-col gap-3 sm:flex-row">
          <Link href={hrefFor("speaker")} className={ctaOnDark}>
            {t("ctaSpeak")}
          </Link>
          <Link href={hrefFor("listener")} className={ctaOutlineOnDark}>
            {t("ctaListen")}
          </Link>
        </div>
      </div>
    </section>
  );
}
