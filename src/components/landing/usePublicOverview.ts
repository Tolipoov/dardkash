"use client";

import type { Availability } from "@/lib/availability";
import { useEffect, useState } from "react";

export interface PublicListener {
  nickname: string;
  avatar: string | null;
  languages: string[];
  topics: string[];
  rating: number;
  sessionsCount: number;
  online: boolean;
  availability: Availability | null;
}

export interface PublicOverview {
  approvedListeners: number;
  onlineListeners: number;
  completedSessions: number;
  moodRatings: number;
  moodBetter: number;
  next: { inHours: number; dayOffset: number; weekday: number; hour: number } | null;
  listeners: PublicListener[];
}

// Bosh sahifada bir nechta komponent (hero holati, dardkashlar ro'yxati)
// bir xil ma'lumotni ishlatadi — so'rov bitta bo'lsin.
let request: Promise<PublicOverview | null> | null = null;

function loadOverview(): Promise<PublicOverview | null> {
  request ??= fetch("/api/public/overview")
    .then((res) => (res.ok ? res.json() : null))
    .catch(() => null);
  return request;
}

export function usePublicOverview(): PublicOverview | null {
  const [overview, setOverview] = useState<PublicOverview | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadOverview().then((data) => {
      if (!cancelled) setOverview(data);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return overview;
}
