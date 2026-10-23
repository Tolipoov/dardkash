"use client";

import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import TopicTag from "@/components/ui/TopicTag";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDays, formatHour } from "@/lib/availability";
import { listenerBadge } from "@/lib/listenerBadge";
import { Heart, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ListenerProfile {
  user_id: string;
  nickname: string;
  avatar: string | null;
  age_range: string;
  languages: string[];
  bio: string;
  rating_avg: string;
  sessions_count: number;
  available_days: number[];
  available_from: number | null;
  available_to: number | null;
  is_online: boolean;
  is_favorite: boolean;
  topics: string[];
  thanks_count: number;
}

// Dardkash profili (kartochkadagi taxallusga bosilganda). Tasdiqlangan
// dardkashlar ochiq; dardini aytuvchilarniki — faqat mini-profil
// (SpeakerMiniProfile), aloqadagi dardkashga.
export default function ListenerProfilePage() {
  const t = useTranslations("profile");
  const tDash = useTranslations("dashboard");
  const tTopics = useTranslations("topics");
  const tDays = useTranslations("days");
  const router = useRouter();
  const toast = useToast();
  const listenerId = useParams().id as string;
  const [profile, setProfile] = useState<ListenerProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [composing, setComposing] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/listeners/${listenerId}/profile`, { credentials: "include" });
      if (res.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!res.ok) {
        setNotFound(true);
        return;
      }
      setProfile((await res.json()).profile);
    } catch {
      setNotFound(true);
    }
  }, [listenerId, router]);

  useEffect(() => {
    // Ma'lumot yuklash: setState faqat so'rov javobidan keyin chaqiriladi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function post(path: string, body?: object) {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message);
    return data;
  }

  async function startSession() {
    setBusy(true);
    try {
      const data = await post("/api/session/start", { listenerId });
      router.push(`/session/${data.sessionId}`);
    } catch {
      toast.push(t("error"), "error");
      setBusy(false);
    }
  }

  async function sendInvite() {
    setBusy(true);
    try {
      await post("/api/invites", { listenerId });
      toast.push(t("inviteSent"), "success");
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    setBusy(true);
    try {
      const data = await post("/api/conversations", { listenerId, message });
      router.push(`/messages/${data.sessionId}`);
    } catch {
      toast.push(t("error"), "error");
      setBusy(false);
    }
  }

  async function toggleFavorite() {
    if (!profile) return;
    const favorite = !profile.is_favorite;
    try {
      const res = await fetch(`/api/favorites/${listenerId}`, {
        method: favorite ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setProfile({ ...profile, is_favorite: favorite });
      toast.push(tDash(favorite ? "favoriteSaved" : "favoriteRemoved"), "success");
    } catch {
      toast.push(t("error"), "error");
    }
  }

  if (notFound) {
    return (
      <section className="bg-sahar px-6 py-20 text-center">
        <p className="text-kul/60">{t("notFound")}</p>
        <Link href="/dashboard" className="mt-4 inline-block text-sm font-semibold text-barg hover:underline">
          ← {t("back")}
        </Link>
      </section>
    );
  }
  if (!profile) return <section className="min-h-[60vh] bg-sahar" />;

  const rating = Number(profile.rating_avg);
  const badge = listenerBadge(profile.sessions_count, rating);
  const hasAvailability =
    profile.available_days.length > 0 &&
    profile.available_from !== null &&
    profile.available_to !== null;

  return (
    <section className="bg-sahar px-6 py-10 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <button
          type="button"
          onClick={() => router.back()}
          className="text-sm font-semibold text-barg hover:underline"
        >
          ← {t("back")}
        </button>

        <div className="mt-6 rounded-wave border border-kul/10 bg-white/70 p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <span className="relative">
              <Avatar code={profile.avatar} nickname={profile.nickname} size={72} />
              <span
                aria-hidden
                className={`absolute bottom-0.5 right-0.5 h-4 w-4 rounded-full ring-2 ring-white ${
                  profile.is_online ? "bg-barg" : "bg-kul/25"
                }`}
              />
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl text-kul">
                {profile.nickname}, {profile.age_range}
              </h1>
              <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-kul/55">
                {profile.is_online ? t("online") : t("offline")}
                {badge && (
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      badge === "experienced"
                        ? "bg-yulduz/15 text-yulduz-dim"
                        : "bg-barg/10 text-barg"
                    }`}
                  >
                    {tDash(badge === "experienced" ? "badgeExperienced" : "badgeNew")}
                  </span>
                )}
              </p>
              <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-kul/70">
                {rating > 0 && <span className="font-semibold text-yulduz-dim">★ {rating.toFixed(1)}</span>}
                <span>{t("sessions", { count: profile.sessions_count })}</span>
                {profile.thanks_count > 0 && <span>💌 {t("thanks", { count: profile.thanks_count })}</span>}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleFavorite}
              aria-pressed={profile.is_favorite}
              aria-label={tDash(profile.is_favorite ? "favoriteRemove" : "favoriteAdd")}
              className="rounded-full p-2 text-gisht transition-colors hover:bg-gisht/10"
            >
              <Heart size={22} fill={profile.is_favorite ? "currentColor" : "none"} />
            </button>
          </div>

          {profile.bio && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-kul/80">{t("about")}</p>
              <p className="mt-1 whitespace-pre-line leading-relaxed text-kul/80">{profile.bio}</p>
            </div>
          )}

          {profile.topics.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-kul/80">{t("topics")}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {profile.topics.map((code) => (
                  <TopicTag key={code} label={tTopics(code)} />
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {profile.languages.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-kul/80">{t("languages")}</p>
                <p className="mt-1 text-sm text-kul/70">
                  {profile.languages.map((l) => l.toUpperCase()).join(" · ")}
                </p>
              </div>
            )}
            {hasAvailability && (
              <div>
                <p className="text-sm font-semibold text-kul/80">{t("availability")}</p>
                <p className="mt-1 text-sm text-kul/70">
                  {formatDays(profile.available_days, (d) => tDays(String(d)), tDash("everyDay"))},{" "}
                  {formatHour(profile.available_from!)}–{formatHour(profile.available_to!)}
                </p>
              </div>
            )}
          </div>

          {composing ? (
            <div className="mt-8">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={t("messagePlaceholder")}
                rows={4}
                maxLength={1000}
                autoFocus
                className="w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 text-base outline-none focus:border-barg sm:text-sm"
              />
              <div className="mt-3 flex gap-2">
                <Button variant="ghost" onClick={() => setComposing(false)}>
                  {t("cancel")}
                </Button>
                <Button className="flex-1" disabled={busy || !message.trim()} onClick={sendMessage}>
                  {t("send")}
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-wrap gap-2">
              {profile.is_online ? (
                <Button className="flex-1 whitespace-nowrap" disabled={busy} onClick={startSession}>
                  {t("startSession")}
                </Button>
              ) : (
                <Button
                  className="flex-1 whitespace-nowrap"
                  variant="secondary"
                  disabled={busy}
                  onClick={sendInvite}
                >
                  {t("sendInvite")}
                </Button>
              )}
              <button
                type="button"
                onClick={() => setComposing(true)}
                className="inline-flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full border border-barg/40 bg-barg/5 px-5 py-2.5 text-sm font-semibold text-barg transition-colors hover:bg-barg/15"
              >
                <MessageCircle size={16} aria-hidden />
                {t("writeMessage")}
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
