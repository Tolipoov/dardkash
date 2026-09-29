import HeroCTAButtons from "@/components/landing/HeroCTAButtons";
import VoiceWaveVisual from "@/components/landing/VoiceWaveVisual";
import { getTranslations } from "next-intl/server";
import { Lock } from "lucide-react";

export default async function Hero() {
  const t = await getTranslations("landing");

  return (
    <section className="grid items-center gap-16 px-6 pb-24 pt-12 md:grid-cols-[1.15fr_1fr] md:px-18">
      <div>
        <h1 className="mb-6 text-pretty font-display text-[40px] leading-[1.1] tracking-[-0.02em] text-kul md:text-[60px]">
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
      <div className="relative flex h-[320px] items-center justify-center md:h-[520px]">
        <div
          aria-hidden="true"
          className="absolute -right-6 -top-5 size-[220px] rounded-full bg-yulduz-100 md:size-[300px]"
        />
        <VoiceWaveVisual />
      </div>
    </section>
  );
}
