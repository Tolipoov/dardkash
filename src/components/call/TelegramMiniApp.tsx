"use client";

import { AUTH_CHANGED_EVENT } from "@/components/call/CallNotifier";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useEffect } from "react";

const STORAGE_KEY = "dardkash:tgWebAppData";

interface TelegramWebApp {
  ready: () => void;
  expand: () => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

// Telegram Mini App: bot'dagi "Dardkash'ni ochish" tugmasi saytni Telegram
// ichida ochadi va URL hash'ida imzolangan `tgWebAppData` beradi. Shu orqali
// foydalanuvchi alohida "Kirish"siz avtomatik kiradi
// (POST /api/auth/telegram-webapp). Oddiy brauzerda bu komponent hech narsa
// qilmaydi va Telegram skriptini ham yuklamaydi.
export default function TelegramMiniApp() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const fromHash = new URLSearchParams(window.location.hash.slice(1)).get("tgWebAppData");
    // Sahifadan sahifaga o'tganda hash yo'qoladi — sessiya davomida eslab qolamiz.
    if (fromHash) sessionStorage.setItem(STORAGE_KEY, fromHash);
    const initData = fromHash ?? sessionStorage.getItem(STORAGE_KEY);
    if (!initData) return;

    if (!window.Telegram?.WebApp) {
      const script = document.createElement("script");
      script.src = "https://telegram.org/js/telegram-web-app.js";
      script.async = true;
      script.onload = () => {
        window.Telegram?.WebApp?.ready();
        window.Telegram?.WebApp?.expand();
      };
      document.head.appendChild(script);
    }

    if (!fromHash) return;
    let cancelled = false;
    (async () => {
      const me = await fetch("/api/me", { credentials: "include" });
      if (me.ok || cancelled) return;
      const res = await fetch("/api/auth/telegram-webapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ initData }),
      });
      if (!res.ok || cancelled) return;
      const data = await res.json();
      window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
      // Bosh sahifadan yoki "Kirish"dan ochilgan bo'lsa — to'g'ridan-to'g'ri ishga.
      if (pathname === "/" || pathname === "/auth") {
        router.replace(data.hasProfile ? "/dashboard" : "/onboarding");
      } else {
        router.refresh();
      }
    })().catch((err) => console.error("Telegram Mini App login xatosi:", err));
    return () => {
      cancelled = true;
    };
    // Faqat birinchi ochilishda (hash shunda keladi).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
