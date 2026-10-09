import HeroCTAButtons from "@/components/landing/HeroCTAButtons";
import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";
import Image from "next/image";

export default async function Hero() {
  const t = await getTranslations("landing");

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-16 px-4 pb-24 pt-12 md:grid-cols-[1.15fr_1fr]">
      <div>
        <h1 className="mb-6 text-pretty font-display text-[34px] leading-[1.1] tracking-[-0.02em] text-kul md:text-[60px]">
          {t("title")}
        </h1>
        <p className="mb-10 max-w-[520px] text-[19px] leading-relaxed text-kul/70">
          {t("subtitle")}
        </p>
        <HeroCTAButtons />
        <p className="mt-6 flex items-center gap-2 text-[15px] text-kul/55">
          <Lock size={18} strokeWidth={2.75} /> {t("trustNote")}
        </p>
      </div>
      <div className="relative flex items-center justify-center md:h-[520px]">
        <div
          aria-hidden="true"
          className="absolute -right-3 -top-4 size-[180px] md:-right-6 md:-top-5 rounded-full bg-yulduz-100 md:size-[300px]"
        />
        <div className="relative aspect-[4/5] w-full overflow-hidden md:h-full md:w-auto rounded-[40px] bg-sahar-dim">
          <Image
            src="/images/hero.webp"
            alt={t("heroImageAlt")}
            fill
            priority
            sizes="(min-width: 768px) 416px, 100vw"
            className="object-cover"
          />
        </div>
      </div>
    </section>
  );
}
