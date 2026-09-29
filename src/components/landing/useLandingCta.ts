"use client";

import { useEffect, useState } from "react";

export type Role = "speaker" | "listener";

interface ProfileState {
  wants: string | null;
  isComplete: boolean;
}

// Bosh sahifadagi barcha CTA tugmalar (Hero, rol kartalari, "tinglovchi
// bo'lmoqchimisiz" bloki, pastki CTA) shu bitta hook orqali /api/profile'ni
// bir marta so'raydi: profil to'liq va tanlagan rolni allaqachon qoplasa,
// havola to'g'ridan-to'g'ri /dashboard'ga, aks holda /onboarding?role=...ga.
export function useLandingCta() {
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

  function hrefFor(role: Role): string {
    if (!profile || !profile.isComplete) return `/onboarding?role=${role}`;
    const covered = profile.wants === role || profile.wants === "both";
    return covered ? "/dashboard" : `/onboarding?role=${role}`;
  }

  return { hrefFor };
}
