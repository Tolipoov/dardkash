"use client";

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { defaultLocale } from "@/i18n/config";

export type Role = "speaker" | "listener";

interface ProfileState {
  wants: string | null;
  isComplete: boolean;
}

// Login sahifasiga yuboriladigan `next` manzili. Backend redirect'i locale
// prefiksini o'zi qo'shmaydi, shuning uchun uz'dan boshqa tilda uni shu
// yerda qo'shamiz — aks holda /ru foydalanuvchisi login'dan keyin uz'ga
// tushib qoladi.
export function authHrefFor(role: string | null, locale: string): string {
  const prefix = locale === defaultLocale ? "" : `/${locale}`;
  const query = role ? `?role=${role}` : "";
  return `/auth?next=${encodeURIComponent(`${prefix}/onboarding${query}`)}`;
}

type ProfileResult = { loggedOut: boolean; profile: ProfileState | null };

// Bosh sahifada hook 5 ta komponentda chaqiriladi — har biri o'zi so'rasa,
// bitta sahifa ochilishida /api/profile 5 marta ketardi. Bitta umumiy
// so'rov; qisqa muddat (kirish/chiqishdan keyin eski holat qolib ketmasin).
const SHARED_TTL_MS = 5000;
let shared: { at: number; promise: Promise<ProfileResult> } | null = null;

function loadProfileOnce(): Promise<ProfileResult> {
  if (shared && Date.now() - shared.at < SHARED_TTL_MS) return shared.promise;
  const promise = fetch("/api/profile", { credentials: "include" })
    .then(async (res): Promise<ProfileResult> => {
      if (res.status === 401) return { loggedOut: true, profile: null };
      const data = res.ok ? await res.json() : null;
      const p = data?.profile;
      if (!p) return { loggedOut: false, profile: null };
      return {
        loggedOut: false,
        profile: {
          wants: p.wants || null,
          isComplete: Boolean(p.nickname && p.age_range && p.wants && p.topics?.length),
        },
      };
    })
    .catch(() => ({ loggedOut: false, profile: null }));
  shared = { at: Date.now(), promise };
  return promise;
}

// Bosh sahifadagi barcha CTA tugmalar (Hero, rol kartalari, "tinglovchi
// bo'lmoqchimisiz" bloki, pastki CTA) shu bitta hook orqali /api/profile'ni
// bir marta so'raydi: tizimga kirmagan bo'lsa — to'g'ridan-to'g'ri /auth'ga
// (onboarding orqali o'tib, keyin auth'ga "sakramasin"), profil to'liq va
// tanlagan rolni allaqachon qoplasa — /dashboard'ga, aks holda
// /onboarding?role=...ga.
export function useLandingCta() {
  const locale = useLocale();
  const [profile, setProfile] = useState<ProfileState | null>(null);
  const [loggedOut, setLoggedOut] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadProfileOnce().then((r) => {
      if (cancelled) return;
      if (r.loggedOut) setLoggedOut(true);
      if (r.profile) setProfile(r.profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function hrefFor(role: Role): string {
    if (loggedOut) return authHrefFor(role, locale);
    if (!profile || !profile.isComplete) return `/onboarding?role=${role}`;
    const covered = profile.wants === role || profile.wants === "both";
    return covered ? "/dashboard" : `/onboarding?role=${role}`;
  }

  return { hrefFor };
}
