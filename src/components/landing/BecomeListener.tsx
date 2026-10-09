"use client";

import { ctaYulduzOutline } from "@/components/landing/cta";
import { useLandingCta } from "@/components/landing/useLandingCta";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function BecomeListener() {
  const t = useTranslations("landing");
  const { hrefFor } = useLandingCta();

  const steps = [
    { title: t("becomeStep1Title"), body: t("becomeStep1Body") },
    { title: t("becomeStep2Title"), body: t("becomeStep2Body") },
    { title: t("becomeStep3Title"), body: t("becomeStep3Body") },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4">
      <section className="grid gap-14 rounded-[48px] bg-yulduz-100 p-8 md:grid-cols-[1fr_1.2fr] md:p-16">
        <div>
          <h2 className="mb-4 font-display text-[28px] leading-tight md:text-[40px] text-yulduz-ink">
            {t("becomeTitle")}
          </h2>
          <p className="mb-8 text-[17px] leading-relaxed text-yulduz-ink-2">
            {t("becomeBody")}
          </p>
          <Link href={hrefFor("listener")} className={ctaYulduzOutline}>
            {t("ctaListen")}
          </Link>
        </div>
        <ol className="flex flex-col gap-3.5">
          {steps.map((step, i) => (
            <li
              key={step.title}
              className="grid grid-cols-[48px_1fr] items-center gap-[18px] rounded-[32px] bg-sahar px-6 py-5 md:rounded-full"
            >
              <span className="grid size-12 place-items-center rounded-full bg-yulduz font-display text-xl text-sahar">
                {i + 1}
              </span>
              <div>
                <strong className="text-[17px] text-kul">{step.title}</strong>
                <div className="text-sm text-kul/55">{step.body}</div>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
