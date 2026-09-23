"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface Stats {
  approvedListeners: number;
  completedSessions: number;
}

// Kichik sonlarni ko'rsatish ("2 ta dardkash") ishonchni oshirish o'rniga
// aksincha sayt hali bo'sh ekanini ta'kidlab qo'yadi — shu sabab har bir
// ko'rsatkich alohida chegaradan o'tgandagina chiqariladi.
const MIN_TO_DISPLAY = 3;

export default function LandingStats() {
  const t = useTranslations("landing");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch("/api/stats/public")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.status === "ok") {
          setStats({
            approvedListeners: data.approvedListeners,
            completedSessions: data.completedSessions,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!stats) return null;
  const showListeners = stats.approvedListeners >= MIN_TO_DISPLAY;
  const showSessions = stats.completedSessions >= MIN_TO_DISPLAY;
  if (!showListeners && !showSessions) return null;

  return (
    <div className="bg-sahar px-6 pt-16">
      <div className="mx-auto flex max-w-6xl flex-wrap items-stretch justify-center gap-x-0 gap-y-6 divide-x divide-kul/10 text-center">
        {showListeners && (
          <div className="px-10 first:pl-0 last:pr-0">
            <p className="font-display text-3xl text-barg">
              {stats.approvedListeners}+
            </p>
            <p className="mt-1 text-sm text-kul/60">{t("statsListeners")}</p>
          </div>
        )}
        {showSessions && (
          <div className="px-10 first:pl-0 last:pr-0">
            <p className="font-display text-3xl text-barg">
              {stats.completedSessions}+
            </p>
            <p className="mt-1 text-sm text-kul/60">{t("statsSessions")}</p>
          </div>
        )}
      </div>
    </div>
  );
}
