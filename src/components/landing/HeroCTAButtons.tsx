"use client";

import Button from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

type Role = "speaker" | "listener";

interface ProfileState {
  wants: string | null;
  isComplete: boolean;
}

// Foydalanuvchi profili to'liqmi va tanlagan rolni allaqachon qoplaydimi —
// shu holatga qarab tugma to'g'ridan-to'g'ri /dashboard'ga yo'naltiriladi.
// Bu tekshiruv shu yerda, sahifa yuklanayotganda (foydalanuvchi hali
// bosmasdan) sodir bo'ladi — /onboarding'ga o'tib, keyin orqaga
// qaytarilish orqali emas, shuning uchun hech qanday "miltillash" bo'lmaydi.
function targetHref(role: Role, profile: ProfileState | null): string {
  if (!profile || !profile.isComplete) return `/onboarding?role=${role}`;
  const covered = profile.wants === role || profile.wants === "both";
  return covered ? "/dashboard" : `/onboarding?role=${role}`;
}

export default function HeroCTAButtons() {
  const t = useTranslations("landing");
  const [profile, setProfile] = useState<ProfileState | null>(null);

  useEffect(() => {
    fetch("/api/profile", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const p = data?.profile;
        if (!p) return;
        setProfile({
          wants: p.wants || null,
          isComplete: Boolean(
            p.nickname && p.age_range && p.wants && p.topics?.length,
          ),
        });
      })
      .catch(() => {});
  }, []);

  return (
    <div className="mt-9 flex flex-wrap gap-4">
      <Link href={targetHref("speaker", profile)}>
        <Button size="lg" variant="primary">
          {t("ctaSpeak")}
        </Button>
      </Link>
      <Link href={targetHref("listener", profile)}>
        <Button size="lg" variant="secondary">
          {t("ctaListen")}
        </Button>
      </Link>
    </div>
  );
}
