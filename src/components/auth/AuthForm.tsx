"use client";
import Button from "@/components/ui/Button";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

export default function AuthForm() {
  const t = useTranslations("auth");
  const telegramRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  useEffect(() => {
    // Telegram Login Widget'ni skript orqali qo'shamiz — bu Telegram'ning
    // o'z tugmasini chizadi va bosilganda backend'ga qaytaradi. `next`ni
    // callback manziliga query sifatida qo'shamiz, shunda backend login'dan
    // keyin foydalanuvchini to'g'ri sahifaga qaytara oladi.
    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute(
      "data-telegram-login",
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "",
    );
    script.setAttribute("data-size", "large");
    script.setAttribute(
      "data-auth-url",
      `/api/auth/telegram/callback?next=${encodeURIComponent(next)}`,
    );
    script.setAttribute("data-request-access", "write");
    telegramRef.current?.appendChild(script);
  }, [next]);

  return (
    <section className="flex min-h-[70vh] items-center justify-center bg-sahar px-6 py-16">
      <div className="w-full max-w-sm rounded-wave border border-kul/10 bg-white/70 p-8">
        <h1 className="font-display text-2xl text-kul text-center">
          {t("title")}
        </h1>
        <p className="mt-2 text-sm text-kul/60 text-center">{t("subtitle")}</p>
        <div className="mt-8 flex flex-col gap-4">
          <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`}>
            <Button variant="primary" size="lg" className="w-full">
              {t("withGoogle")}
            </Button>
          </a>
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-full">
              <div ref={telegramRef} />
            </div>
          </div>
        </div>
        <p className="mt-6 text-xs leading-relaxed text-kul/50 text-center">
          {t("terms")}
        </p>
      </div>
    </section>
  );
}
