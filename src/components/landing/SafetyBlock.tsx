import { getTranslations } from "next-intl/server";
import { Flag, Mic, ShieldCheck, Square, Video, type LucideIcon } from "lucide-react";

export default async function SafetyBlock() {
  const t = await getTranslations("landing");
  const points: Array<{ Icon: LucideIcon; t: string; d: string }> = [
    { Icon: ShieldCheck, t: t("safetyPoint1Title"), d: t("safetyPoint1") },
    { Icon: Square, t: t("safetyPoint2Title"), d: t("safetyPoint2") },
    { Icon: Flag, t: t("safetyPoint3Title"), d: t("safetyPoint3") },
  ];

  return (
    <div className="py-26">
      <div className="grid items-center gap-14 rounded-[40px] bg-barg-100 p-8 md:grid-cols-2 md:p-14">
        <div>
          <p className="mb-9 font-display text-[28px] leading-[1.35] text-barg-ink">{t("safetyBody")}</p>
          <div className="flex flex-col gap-[22px]">
            {points.map(({ Icon, t: title, d }) => (
              <div key={title} className="grid grid-cols-[40px_1fr] gap-4">
                <span className="grid size-10 place-items-center rounded-full bg-barg text-sahar">
                  <Icon size={20} strokeWidth={2.75} />
                </span>
                <div>
                  <strong className="block text-[17px] text-barg-ink">{title}</strong>
                  <span className="text-[15px] text-barg-ink-2">{d}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <span className="text-[13px] font-semibold text-barg-ink-2">{t("safetyPreviewLabel")}</span>
          <div className="relative h-[340px] overflow-hidden rounded-[32px] bg-tun">
            <span className="absolute left-6 top-[22px] text-sm text-sahar/60">
              {t("safetyPreviewName")} · 12:40
            </span>
            <div className="absolute left-1/2 top-[44%] grid size-[120px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-tun-deep font-display text-[40px] text-yulduz">
              {t("safetyPreviewInitial")}
            </div>
            <div className="absolute inset-x-0 bottom-[22px] flex justify-center gap-2.5">
              <span className="grid size-12 place-items-center rounded-full bg-sahar/10 text-sahar">
                <Mic size={20} strokeWidth={2.75} />
              </span>
              <span className="grid size-12 place-items-center rounded-full bg-sahar/10 text-sahar">
                <Video size={20} strokeWidth={2.75} />
              </span>
              <span className="flex h-12 items-center rounded-full bg-sahar px-5 text-sm font-bold text-tun">
                {t("safetyPreviewStop")}
              </span>
              <span className="flex h-12 items-center rounded-full bg-gisht px-5 text-sm font-bold text-sahar">
                {t("safetyPreviewReport")}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
