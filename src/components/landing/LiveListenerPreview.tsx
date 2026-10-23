"use client";

import { ctaPrimary } from "@/components/landing/cta";
import Avatar from "@/components/ui/Avatar";
import { useLandingCta } from "@/components/landing/useLandingCta";
import { usePublicOverview, type PublicListener } from "@/components/landing/usePublicOverview";
import { Link } from "@/i18n/navigation";
import { formatDays, formatHour } from "@/lib/availability";
import { listenerBadge } from "@/lib/listenerBadge";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

// Bosh sahifadagi "Tinglovchi qanday ko'rinadi" bloki: tasdiqlangan
// dardkashlar bo'lsa — haqiqiy kartochkalar (login'siz), bo'lmasa — namuna.
const SHOWN = 3;

function LiveCard({ listener, href }: { listener: PublicListener; href: string }) {
  const t = useTranslations("landing");
  const tDash = useTranslations("dashboard");
  const tTopics = useTranslations("topics");
  const tDays = useTranslations("days");
  const { availability } = listener;
  const badge = listenerBadge(listener.sessionsCount, listener.rating);

  return (
    <div className="flex flex-col gap-4 rounded-[28px] bg-sahar-dim p-6 shadow-[0_3px_10px_rgba(42,41,36,0.16)]">
      <div className="flex items-center gap-3">
        <Avatar code={listener.avatar} nickname={listener.nickname} size={48} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-xl text-kul">{listener.nickname}</div>
          <span className="mt-0.5 flex items-center gap-1.5 text-xs text-kul/55">
            <span
              aria-hidden
              className={`size-2 rounded-full ${listener.online ? "bg-barg" : "bg-kul/25"}`}
            />
            {listener.online ? t("liveOnlineBadge") : t("liveOfflineBadge")}
            {badge && (
              <span className="rounded-full bg-sahar px-2 py-0.5 text-[11px] font-semibold text-barg">
                {tDash(badge === "experienced" ? "badgeExperienced" : "badgeNew")}
              </span>
            )}
          </span>
        </div>
        {listener.sessionsCount > 0 && (
          <span className="shrink-0 text-right text-xs text-kul/55">
            {listener.rating > 0 && (
              <span className="block text-sm font-semibold text-yulduz-dim">
                ★ {listener.rating.toFixed(1)}
              </span>
            )}
            {t("liveSessions", { count: listener.sessionsCount })}
          </span>
        )}
      </div>
      {listener.topics.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {listener.topics.slice(0, 3).map((code) => (
            <span key={code} className="rounded-full bg-sahar px-3 py-1 text-xs text-kul/80">
              {tTopics(code)}
            </span>
          ))}
          {listener.languages.length > 0 && (
            <span className="rounded-full bg-sahar px-3 py-1 text-xs text-kul/55">
              {listener.languages.map((l) => l.toUpperCase()).join(" · ")}
            </span>
          )}
        </div>
      )}
      {availability && (
        <p className="text-xs text-kul/60">
          {tDash("usuallyAvailable", {
            days: formatDays(availability.days, (d) => tDays(String(d)), tDash("everyDay")),
            hours: `${formatHour(availability.from)}–${formatHour(availability.to)}`,
          })}
        </p>
      )}
      <Link href={href} className={`${ctaPrimary} py-2.5 text-base md:py-3 md:text-base`}>
        {t("listenerCardStart")}
      </Link>
    </div>
  );
}

export default function LiveListenerPreview({ sample }: { sample: ReactNode }) {
  const t = useTranslations("landing");
  const overview = usePublicOverview();
  const { hrefFor } = useLandingCta();
  const live = overview?.listeners.slice(0, SHOWN) ?? [];
  const isLive = live.length > 0;

  return (
    <section className="mx-auto grid max-w-6xl items-center gap-18 px-4 py-26 md:grid-cols-[1fr_440px]">
      <div>
        <h2 className="mb-5 font-display text-[28px] leading-tight md:text-[40px] text-kul">
          {isLive ? t("listenerPreviewLiveTitle") : t("listenerPreviewTitle")}
        </h2>
        <p className="mb-4 max-w-[520px] text-lg leading-relaxed text-kul/70">
          {isLive ? t("listenerPreviewLiveBody") : t("listenerPreviewBody")}
        </p>
        <p className="text-[15px] text-kul/55">
          {isLive ? t("listenerPreviewLiveNote") : t("listenerPreviewNote")}
        </p>
      </div>
      {isLive ? (
        <div className="flex flex-col gap-4">
          {live.map((listener) => (
            <LiveCard key={listener.nickname} listener={listener} href={hrefFor("speaker")} />
          ))}
        </div>
      ) : (
        sample
      )}
    </section>
  );
}
