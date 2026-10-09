import { getTranslations } from "next-intl/server";
import { MessageCircle, Mic } from "lucide-react";
import { ctaPrimary } from "@/components/landing/cta";

export default async function ListenerPreview() {
  const t = await getTranslations("landing");

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-18 px-4 py-26 md:grid-cols-[1fr_440px]">
      <div>
        <h2 className="mb-5 font-display text-[28px] leading-tight md:text-[40px] text-kul">{t("listenerPreviewTitle")}</h2>
        <p className="mb-4 max-w-[520px] text-lg leading-relaxed text-kul/70">
          {t("listenerPreviewBody")}
        </p>
        <p className="text-[15px] text-kul/55">{t("listenerPreviewNote")}</p>
      </div>
      <div className="relative">
        <div
          aria-hidden="true"
          className="absolute -bottom-9 -left-9 size-[180px] rounded-full bg-yulduz-100"
        />
        <div className="relative flex flex-col gap-5 rounded-[36px] bg-sahar-dim p-8 shadow-[0_3px_10px_rgba(42,41,36,0.16)]">
          <div className="flex items-center gap-4">
            <span className="grid size-16 place-items-center rounded-full bg-tun font-display text-[26px] text-yulduz">
              {t("safetyPreviewInitial")}
            </span>
            <div className="flex-1">
              <div className="font-display text-2xl text-kul">{t("listenerCardName")}</div>
              <span className="mt-1 inline-flex rounded-full bg-barg-100 px-2.5 py-0.5 text-[11px] font-semibold text-barg-ink">
                {t("listenerCardApproved")}
              </span>
            </div>
            <span className="rounded-full bg-sahar px-2.5 py-0.5 text-[11px] text-kul/55">
              {t("listenerCardSample")}
            </span>
          </div>
          <p className="text-base leading-relaxed text-kul/70">{t("listenerCardBio")}</p>
          <div className="flex flex-wrap gap-2">
            <span className="flex items-center gap-1.5 rounded-full bg-sahar px-3.5 py-2 text-sm font-semibold text-kul">
              <Mic size={16} strokeWidth={2.75} />
              {t("formatAudioTitle")}
            </span>
            <span className="flex items-center gap-1.5 rounded-full bg-sahar px-3.5 py-2 text-sm font-semibold text-kul">
              <MessageCircle size={16} strokeWidth={2.75} />
              {t("formatChatTitle")}
            </span>
            <span className="rounded-full bg-sahar px-3.5 py-2 text-sm text-kul/55">UZ · RU</span>
          </div>
          <span className={`${ctaPrimary} pointer-events-none py-[15px] text-base`}>
            {t("listenerCardStart")}
          </span>
        </div>
      </div>
    </section>
  );
}
