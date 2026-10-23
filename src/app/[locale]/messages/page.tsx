"use client";

import { NOTIFY_EVENT } from "@/components/call/CallNotifier";
import Avatar from "@/components/ui/Avatar";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

interface Conversation {
  id: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  my_role: "speaker" | "listener";
  partner_nickname: string;
  partner_avatar: string | null;
  last_message: string;
  last_is_mine: boolean;
  last_at: string;
  unread: number;
}

// Taklif/suhbat yozishmalari ro'yxati — qo'ng'iroq sahifasiga kirmasdan
// yozishish uchun (GET /api/conversations).
export default function MessagesPage() {
  const t = useTranslations("messages");
  const locale = useLocale();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { credentials: "include" });
      if (res.status === 401) {
        router.replace("/auth");
        return;
      }
      if (res.ok) setItems((await res.json()).conversations);
    } catch (err) {
      console.error("Yozishmalarni yuklashda xato:", err);
    }
  }, [router]);

  useEffect(() => {
    // Ma'lumot yuklash: setState faqat so'rov javobidan keyin chaqiriladi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const onNotify = (event: Event) => {
      if ((event as CustomEvent).detail?.type === "chat_message") load();
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify);
  }, [load]);

  const dateFormat = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    day: "numeric",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const statusKey = {
    scheduled: "statusScheduled",
    active: "statusActive",
    ended: "statusEnded",
    cancelled: "statusCancelled",
  } as const;

  return (
    <section className="bg-sahar px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-kul">{t("pageTitle")}</h1>
        <p className="mt-3 text-kul/70">{t("intro")}</p>
        <p className="mt-2 text-sm text-kul/55">
          {t("lettersHint")}{" "}
          <Link href="/letters" className="font-semibold text-barg hover:underline">
            {t("lettersLink")} →
          </Link>
        </p>

        {items && items.length === 0 && (
          <p className="mt-10 rounded-2xl border border-dashed border-kul/20 bg-white/40 p-8 text-center text-sm text-kul/55">
            {t("empty")}
          </p>
        )}
        {items && items.length > 0 && (
          <ul className="mt-8 divide-y divide-kul/10 overflow-hidden rounded-2xl border border-kul/10 bg-white/60">
            {items.map((c) => (
              <li key={c.id}>
                <Link href={`/messages/${c.id}`} className="flex items-start gap-3 px-5 py-4 hover:bg-white/80">
                  <Avatar code={c.partner_avatar} nickname={c.partner_nickname} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="truncate text-sm font-semibold text-kul">{c.partner_nickname}</p>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-kul/45">
                        {dateFormat.format(new Date(c.last_at))}
                        {c.unread > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-barg px-1.5 text-[11px] font-bold text-sahar">
                            {c.unread}
                          </span>
                        )}
                      </span>
                    </div>
                    <p
                      className={`mt-0.5 truncate text-sm ${
                        c.unread > 0 ? "font-semibold text-kul" : "text-kul/70"
                      }`}
                    >
                      {c.last_is_mine ? `${t("you")}: ` : ""}
                      {c.last_message}
                    </p>
                    <p className="mt-0.5 text-xs text-kul/45">{t(statusKey[c.status])}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
