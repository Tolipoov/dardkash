import { getTranslations } from "next-intl/server";
import { MessageCircle, Mic, Video, type LucideIcon } from "lucide-react";

export default async function Formats() {
  const t = await getTranslations("landing");
  const items: Array<{ Icon: LucideIcon; t: string; d: string }> = [
    { Icon: Video, t: t("formatVideoTitle"), d: t("formatVideoBody") },
    { Icon: Mic, t: t("formatAudioTitle"), d: t("formatAudioBody") },
    { Icon: MessageCircle, t: t("formatChatTitle"), d: t("formatChatBody") },
  ];

  return (
    <div className="pt-30">
      <h2 className="mb-3 font-display text-[40px] text-kul">{t("formatsTitle")}</h2>
      <p className="mb-12 text-[17px] text-kul/60">{t("formatsSubtitle")}</p>
      <div className="grid gap-5 md:grid-cols-3">
        {items.map(({ Icon, t: title, d }) => (
          <div key={title} className="flex flex-col gap-3.5 rounded-[32px] bg-sahar p-9">
            <span className="grid size-14 place-items-center rounded-full bg-barg-100 text-barg">
              <Icon size={26} strokeWidth={2.75} />
            </span>
            <h3 className="font-display text-2xl text-kul">{title}</h3>
            <p className="text-base text-kul/60">{d}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
