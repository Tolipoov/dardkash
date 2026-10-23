"use client";

import { MOOD_BEFORE_EMOJI } from "@/lib/mood";
import { useTranslations } from "next-intl";
import { useState } from "react";

// Suhbat boshida dardini aytuvchidan kayfiyatini so'raydi (ixtiyoriy,
// bloklamaydi). Suhbatdan keyingi kayfiyat FeedbackModal'da so'raladi —
// kabinetda ikkalasi "oldin → keyin" ko'rinadi.
export default function MoodCheck({
  sessionId,
  answered,
}: {
  sessionId: string;
  answered: boolean;
}) {
  const t = useTranslations("session");
  const [picked, setPicked] = useState<number | null>(null);
  const [thanked, setThanked] = useState(false);

  if (answered && picked === null) return null;
  if (thanked) return null;

  async function pick(mood: number) {
    setPicked(mood);
    try {
      await fetch(`/api/session/${sessionId}/mood-before`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ mood }),
      });
    } catch {
      // Ixtiyoriy ma'lumot — saqlanmasa ham suhbat davom etadi.
    }
    setTimeout(() => setThanked(true), 2500);
  }

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-sm rounded-2xl bg-sahar/10 px-4 py-3 text-center backdrop-blur-sm">
      {picked === null ? (
        <>
          <p className="text-sm text-sahar/80">{t("moodBeforeTitle")}</p>
          <div className="mt-2 flex justify-center gap-1.5">
            {[1, 2, 3, 4, 5].map((mood) => (
              <button
                key={mood}
                type="button"
                onClick={() => pick(mood)}
                title={t(`mood${mood}`)}
                aria-label={t(`mood${mood}`)}
                className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform hover:scale-110 hover:bg-sahar/10"
              >
                {MOOD_BEFORE_EMOJI[mood]}
              </button>
            ))}
          </div>
        </>
      ) : (
        <p className="text-sm text-sahar/80">
          {MOOD_BEFORE_EMOJI[picked]} {t("moodBeforeThanks")}
        </p>
      )}
    </div>
  );
}
