"use client";

import { useEffect, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { locales, type Locale } from "@/i18n/config";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";

interface Me {
  nickname: string | null;
  role: string | null;
}

export default function SiteHeader() {
  const t = useTranslations("nav");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();

  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMe(data?.user ?? null))
      .catch(() => setMe(null))
      .finally(() => setChecked(true));
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" }).catch(() => {});
    setMe(null);
    setMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const isStaff = me?.role === "admin" || me?.role === "moderator";
  const initial = (me?.nickname || "?").trim().charAt(0).toUpperCase();

  return (
    <header className="sticky top-0 z-40 bg-sahar/90 backdrop-blur-md border-b border-kul/10">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link href="/" className="flex items-center">
          <img src="/logo.svg" alt="Dardkash" className="h-10 w-auto" />
        </Link>

        <nav className="hidden items-center gap-8 md:flex">
          <Link href="/#how" className="text-md text-kul/80 hover:text-kul">
            {t("howItWorks")}
          </Link>
          <Link href="/onboarding?role=listener" className="text-sm text-kul/80 hover:text-kul">
            {t("becomeListener")}
          </Link>
        </nav>

        <div className="flex items-center gap-3">
          <div className="flex overflow-hidden rounded-full border border-kul/15 text-xs">
            {locales.map((loc) => (
              <Link
                key={loc}
                href={pathname}
                locale={loc}
                className={`px-3 py-1.5 font-semibold ${
                  loc === locale ? "bg-kul text-sahar" : "text-kul/60 hover:bg-kul/5"
                }`}
              >
                {loc.toUpperCase()}
              </Link>
            ))}
          </div>

          {!checked ? (
            <div className="h-9 w-9 rounded-full bg-kul/5" />
          ) : me ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-kul/15 py-1.5 pl-1.5 pr-3 hover:border-barg/50"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-barg text-xs font-semibold text-sahar">
                  {initial}
                </span>
                <span className="max-w-[120px] truncate text-sm text-kul">
                  {me.nickname || "Profil"}
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
                      Shaxsiy kabinet
                    </Link>
                    <Link
                      href="/onboarding"
                      onClick={() => setMenuOpen(false)}
                      className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                    >
                      Profilni tahrirlash
                    </Link>
                    {isStaff && (
                      <Link
                        href="/admin/moderation"
                        onClick={() => setMenuOpen(false)}
                        className="block px-4 py-2 text-sm text-kul hover:bg-kul/5"
                      >
                        Moderatsiya
                      </Link>
                    )}
                    <div className="my-1 border-t border-kul/10" />
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="block w-full px-4 py-2 text-left text-sm text-gisht hover:bg-gisht/10"
                    >
                      Chiqish
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <Link href="/auth">
              <Button size="md" variant="ghost">
                {t("login")}
              </Button>
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
