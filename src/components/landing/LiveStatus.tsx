"use client";

import { usePublicOverview } from "@/components/landing/usePublicOverview";
import { formatHour } from "@/lib/availability";
import { useTranslations } from "next-intl";

// Kamroq bahodan foiz chiqarish chalg'ituvchi bo'lardi.
const MIN_MOOD_RATINGS = 5;

// Hero ostidagi jonli holat: "Hozir 2 ta dardkash onlayn" yoki, hech kim
// onlayn bo'lmasa, ular odatda qachon bo'sh bo'lishi.
export default function LiveStatus() {
  const t = useTranslations("landing");
  const tDash = useTranslations("dashboard");
  const tDaysLong = useTranslations("daysLong");
  const overview = usePublicOverview();
  if (!overview || overview.approvedListeners === 0) return null;

  const { onlineListeners, next } = overview;
  let main: string | null = null;
  if (onlineListeners > 0) main = t("liveOnline", { count: onlineListeners });
  else if (next && next.inHours > 0) {
    const hour = formatHour(next.hour);
    main =
      next.dayOffset === 0
        ? tDash("nextAvailableToday", { hour })
        : next.dayOffset === 1
          ? tDash("nextAvailableTomorrow", { hour })
          : tDash("nextAvailableDay", { day: tDaysLong(String(next.weekday)), hour });
  }

  return (
    <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-kul/70">
      {main && (
        <span className="flex items-center gap-2">
          <span
            aria-hidden
            className={`size-2.5 rounded-full ${onlineListeners > 0 ? "animate-pulseSoft bg-barg" : "bg-yulduz"}`}
          />
          {main}
        </span>
      )}
      {main && <span aria-hidden>·</span>}
      <span>{t("liveApproved", { count: overview.approvedListeners })}</span>
      {overview.moodRatings >= MIN_MOOD_RATINGS && (
        <>
          <span aria-hidden>·</span>
          <span>
            {t("liveMoodBetter", {
              percent: Math.round((overview.moodBetter / overview.moodRatings) * 100),
            })}
          </span>
        </>
      )}
    </p>
  );
}
