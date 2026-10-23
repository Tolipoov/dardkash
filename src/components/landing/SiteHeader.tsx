"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { locales, type Locale } from "@/i18n/config";
import Avatar from "@/components/ui/Avatar";
import { disablePush } from "@/lib/push";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authHrefFor } from "@/components/landing/useLandingCta";
import {
  AUTH_CHANGED_EVENT,
  NOTIFY_EVENT,
  UNREAD_CHANGED_EVENT,
} from "@/components/call/CallNotifier";

interface Me {
  nickname: string | null;
  avatar?: string | null;
  role: string | null;
  wants: string | null;
}

export default function SiteHeader() {
  const t = useTranslations("nav");
  const tLetters = useTranslations("letters");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // O'qilmagan xabarlar: yozishmalar (chats) va yangi javobli xatlar (letters).
  const [unread, setUnread] = useState({ chats: 0, letters: 0, total: 0 });

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.user ?? null))
      .catch(() => setMe(null))
      .finally(() => setChecked(true));
  }, []);

  // Yangi xabar kelganda, xabar o'qilganda va har 30 soniyada yangilanadi.
  const loggedIn = Boolean(me);
  useEffect(() => {
    if (!loggedIn) return;
    let cancelled = false;
    const load = () =>
      fetch("/api/unread", { credentials: "include" })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data && !cancelled) {
            setUnread({ chats: data.chats, letters: data.letters, total: data.total });
          }
        })
        .catch(() => {});
    load();
    const onNotify = (event: Event) => {
      const type = (event as CustomEvent).detail?.type as string | undefined;
      if (type === "chat_message" || type?.startsWith("letter_")) load();
    };
    const timer = setInterval(load, 30000);
    window.addEventListener(NOTIFY_EVENT, onNotify);
    window.addEventListener(UNREAD_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(NOTIFY_EVENT, onNotify);
      window.removeEventListener(UNREAD_CHANGED_EVENT, load);
    };
  }, [loggedIn]);

  const countBadge = (count: number) =>
    count > 0 && (
      <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-barg px-1.5 text-[11px] font-bold text-sahar">
        {count > 99 ? "99+" : count}
      </span>
    );

  async function handleLogout() {
    // Umumiy qurilmada chiqqan hisob bildirishnomalari kelmasin.
    await disablePush().catch(() => {});
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setMe(null);
    setMenuOpen(false);
    window.dispatchEvent(new Event(AUTH_CHANGED_EVENT));
    router.push("/");
    router.refresh();
  }

  const isStaff = me?.role === "admin" || me?.role === "moderator";
  const initial = (me?.nickname || "?").trim().charAt(0).toUpperCase();

  // `wants` faqat profil to'liq to'ldirilgandan keyin yoziladi (bitta
  // tranzaksiyada), shuning uchun uning mavjudligi profil to'liqligining
  // ishonchli belgisi. Agar "listener"/"both" allaqachon qoplasa, havola
  // to'g'ridan-to'g'ri kabinetga olib boradi — /onboarding orqali o'tib,
  // keyin qaytarilish (miltillash) o'rniga.
  // Tizimga kirmagan bo'lsa — to'g'ridan-to'g'ri /auth'ga.
  const becomeListenerHref =
    checked && !me
      ? authHrefFor("listener", locale)
      : me?.wants === "listener" || me?.wants === "both"
        ? "/dashboard"
        : "/onboarding?role=listener";

  return (
    <header className="sticky top-0 z-40 bg-sahar/90 backdrop-blur-md border-b border-kul/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center">
          {/* logo.svg'ning viewBox'i rasmning o'ziga qirqilgan — balandlik = ko'rinadigan o'lcham. */}
          <img src="/logo.svg" alt="Dardkash" className="h-6 w-auto sm:h-7 md:h-8" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#how" className="text-sm font-medium text-kul/80 hover:text-kul">
            {t("howItWorks")}
          </Link>
          <Link href={becomeListenerHref} className="text-sm font-medium text-kul/80 hover:text-kul">
            {t("becomeListener")}
          </Link>
        </nav>

        {/* Til almashtirgich va profil tugmasi bir xil balandlikda (h-9). */}
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="flex h-9 items-center gap-0.5 rounded-full bg-sahar-dim p-1 text-xs">
            {locales.map((loc) => (
              <Link
                key={loc}
                href={pathname}
                locale={loc}
                aria-current={loc === locale ? "true" : undefined}
                className={`flex h-7 items-center rounded-full px-2.5 font-bold transition-colors sm:px-3 ${
                  loc === locale ? "bg-barg text-sahar shadow-sm" : "text-kul/60 hover:text-barg"
                }`}
              >
                {loc.toUpperCase()}
              </Link>
            ))}
          </div>

          {!checked ? (
            <div className="h-9 w-9 shrink-0 rounded-full bg-kul/5" />
          ) : me ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={
                  unread.total > 0
                    ? `${me.nickname || t("profile")} — ${t("unreadTitle", { count: unread.total })}`
                    : me.nickname || t("profile")
                }
                title={unread.total > 0 ? t("unreadTitle", { count: unread.total }) : undefined}
                className="relative flex h-9 items-center gap-2 rounded-full border border-kul/15 p-1 hover:border-barg/50 sm:pr-3"
              >
                {/* O'qilmagan xabarlar — yashil doirachada son. */}
                {unread.total > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-barg px-1 text-[11px] font-bold leading-none text-sahar ring-2 ring-sahar">
                    {unread.total > 99 ? "99+" : unread.total}
                  </span>
                )}
                {me.avatar ? (
                  <Avatar code={me.avatar} nickname={me.nickname || "?"} size={28} />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-barg text-xs font-semibold text-sahar">
                    {initial}
                  </span>
                )}
                {/* Telefonda faqat bosh harf — taxallus joyni egallab, logoni siqmasin. */}
                <span className="hidden max-w-[110px] truncate text-[13px] font-medium text-kul sm:inline">
                  {me.nickname || t("profile")}
                </span>
              </button>

              {menuOpen && (
                <>
                  {/* Tashqariga bosilganda menyu yopilishi uchun ko'rinmas qatlam */}
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-2xl border border-kul/10 bg-sahar py-2 shadow-lg">
                    <Link
                      href="/dashboard"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                    >
                      {t("dashboard")}
                    </Link>
                    <Link
                      href="/messages"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                    >
                      {t("messages")}
                      {countBadge(unread.chats)}
                    </Link>
                    <Link
                      href="/letters"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                    >
                      {tLetters("pageTitle")}
                      {countBadge(unread.letters)}
                    </Link>
                    <Link
                      href="/onboarding?edit=1"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                    >
                      {t("editProfile")}
                    </Link>
                    {isStaff && (
                      <Link
                        href="/admin/moderation"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                      >
                        {t("moderation")}
                      </Link>
                    )}
                    <div className="my-1 border-t border-kul/10" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full px-4 py-2 text-left text-sm text-gisht hover:bg-gisht/10"
                    >
                      {t("logout")}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link
              href="/auth"
              className="flex h-9 items-center rounded-full px-4 text-sm font-semibold text-kul transition-colors hover:bg-kul/5"
            >
              {t("login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
