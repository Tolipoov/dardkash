"use client";

import ListenerCard, {
  type ListenerSummary,
} from "@/components/dashboard/ListenerCard";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "@/i18n/navigation";
import { buildWsUrl } from "@/lib/ws";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

interface Me {
  nickname: string | null;
  listener_status: string | null;
  telegram_id: string | null;
}

interface IncomingInvite {
  id: string;
  status: string;
  speaker_nickname: string;
  created_at: string;
}

interface RecentSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  my_role: "speaker" | "listener";
  partner_nickname: string;
  rated: boolean;
}

interface SentInvite {
  id: string;
  status: string;
  listener_nickname: string;
}

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();

  const [me, setMe] = useState<Me | null>(null);
  const [listeners, setListeners] = useState<ListenerSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [incomingCall, setIncomingCall] = useState<{
    sessionId: string;
    speakerName: string;
  } | null>(null);

  const [linkingTelegram, setLinkingTelegram] = useState(false);

  const reloadMe = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { credentials: "include" });
      if (res.ok) setMe((await res.json()).user);
    } catch {}
  }, []);

  // Dardkashlar ro'yxati avval faqat sahifa ochilganda bir marta
  // yuklanardi — yangi tasdiqlangan yoki endigina onlayn bo'lgan dardkash
  // sahifa qo'lda yangilanmaguncha ko'rinmasdi. Endi muntazam yangilanadi.
  const loadListeners = useCallback(async () => {
    try {
      const res = await fetch("/api/listeners", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setListeners(
        (data.listeners || []).map((l: any) => ({
          id: l.user_id,
          nickname: l.nickname,
          ageRange: l.age_range,
          topics: l.topics,
          rating: Number(l.rating_avg),
          sessionsCount: l.sessions_count,
          online: l.is_online,
        })),
      );
    } catch (err) {
      console.error("Dardkashlarni yuklashda xato:", err);
    }
  }, []);

  const loadRecentSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/recent", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setRecentSessions(data.sessions || []);
    } catch (err) {
      console.error("So'nggi suhbatlarni yuklashda xato:", err);
    }
  }, []);

  const loadInvites = useCallback(async () => {
    try {
      const [incomingRes, sentRes] = await Promise.all([
        fetch("/api/invites/incoming", { credentials: "include" }),
        fetch("/api/invites/sent", { credentials: "include" }),
      ]);
      const incomingData = await incomingRes.json();
      const sentData = await sentRes.json();
      setIncomingInvites(incomingData.invites || []);
      setSentInvites(sentData.invites || []);
    } catch (err) {
      console.error("Takliflarni yuklashda xato:", err);
    }
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const meRes = await fetch("/api/me", { credentials: "include" });

        if (meRes.status === 401) {
          router.push("/auth");
          return;
        }

        const meData = await meRes.json();
        setMe(meData.user);

        await Promise.all([loadListeners(), loadInvites(), loadRecentSessions()]);
      } catch (err) {
        console.error(err);
        toast.push("Ma'lumotlarni yuklashda xato", "error");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, toast, loadInvites, loadListeners, loadRecentSessions]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible") loadListeners();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadListeners]);

  const isApprovedListener = me?.listener_status === "approved";
  useEffect(() => {
    if (!isApprovedListener) return;

    function setPresence(online: boolean) {
      navigator.sendBeacon(
        "/api/listeners/presence",
        new Blob([JSON.stringify({ online })], { type: "application/json" }),
      );
    }

    fetch("/api/listeners/presence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ online: true }),
    }).catch(() => {});

    const heartbeat = setInterval(() => {
      fetch("/api/listeners/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ online: true }),
      }).catch(() => {});
    }, 30000);

    const goOffline = () => setPresence(false);
    window.addEventListener("beforeunload", goOffline);
    return () => {
      clearInterval(heartbeat);
      goOffline();
      window.removeEventListener("beforeunload", goOffline);
    };
  }, [isApprovedListener]);

  // Real vaqtli "qo'ng'iroq" — backend (POST /api/session/start,
  // POST /api/invites) allaqachon /api/ws/notify orqali incoming_call /
  // new_invite hodisasini yuborardi, lekin dashboard bu socket'ni HECH
  // QACHON tinglamas edi — natijada dardkash sahifani qo'lda yangilamas
  // ekan, unga "qo'ng'iroq qilinganini" bilishning iloji yo'q edi. Endi
  // shu yerda ulanamiz va hodisa kelganda darhol ekranda ko'rsatamiz.
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let socket: WebSocket | null = null;

    function connect() {
      if (cancelled) return;
      socket = new WebSocket(buildWsUrl("/api/ws/notify"));

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "incoming_call" || data.type === "new_invite") {
            setIncomingCall({ sessionId: data.sessionId, speakerName: data.speakerName });
            loadInvites();
          } else if (data.type === "invite_accepted") {
            toast.push("Taklifingiz qabul qilindi", "success");
            loadInvites();
          } else if (data.type === "invite_declined") {
            toast.push("Taklifingiz rad etildi", "info");
            loadInvites();
          } else if (data.type === "telegram_linked") {
            toast.push(t("telegramLinked"), "success");
            setLinkingTelegram(false);
            reloadMe();
          }
        } catch (err) {
          console.error("Bildirishnoma xabarini o'qishda xato:", err);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      socket?.close();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Telegram ulanmagan dardkash offlayn paytida kelgan qo'ng'iroqlarni
  // bilmay qoladi — bot orqali bir martalik havola bilan ulaymiz. Oynani
  // fetch'dan OLDIN ochamiz: aks holda (await'dan keyin) mobil brauzerlar
  // uni popup deb bloklaydi.
  async function connectTelegram() {
    setLinkingTelegram(true);
    const tab = window.open("", "_blank");
    try {
      const res = await fetch("/api/telegram/link", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok || !data.url) throw new Error(data.message);
      if (tab) tab.location.href = data.url;
      else window.location.href = data.url;
    } catch (err) {
      console.error(err);
      tab?.close();
      toast.push(t("telegramLinkError"), "error");
      setLinkingTelegram(false);
    }
  }

  // Foydalanuvchi Telegram'dan qaytganda (socket uzilgan bo'lsa ham)
  // holatni yangilaymiz.
  useEffect(() => {
    if (!linkingTelegram) return;
    window.addEventListener("focus", reloadMe);
    return () => window.removeEventListener("focus", reloadMe);
  }, [linkingTelegram, reloadMe]);

  async function startSessionWith(listenerId: string) {
    setSearching(true);
    try {
      const res = await fetch("/api/session/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listenerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Suhbat boshlab bo'lmadi");
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      console.error(err);
      toast.push("Suhbat boshlab bo'lmadi, qayta urinib ko'ring", "error");
      setSearching(false);
    }
  }

  async function inviteListener(listenerId: string) {
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listenerId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Taklif yuborilmadi");
      toast.push("Taklif yuborildi", "success");
      loadInvites();
    } catch (err) {
      console.error(err);
      toast.push("Taklif yuborishda xato yuz berdi", "error");
    }
  }

  async function respondToInvite(inviteId: string, accept: boolean) {
    setIncomingCall((current) => (current?.sessionId === inviteId ? null : current));
    try {
      const res = await fetch(`/api/invites/${inviteId}/${accept ? "accept" : "decline"}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (accept) {
        router.push(`/session/${inviteId}`);
      } else {
        toast.push("Taklif rad etildi", "info");
        loadInvites();
      }
    } catch (err) {
      console.error(err);
      toast.push("Amalni bajarib bo'lmadi", "error");
    }
  }

  async function startSearch() {
    setSearching(true);
    try {
      const res = await fetch("/api/session/match", {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) {
        toast.push(
          data.message || "Hozircha mos dardkash yo'q, birozdan keyin qayta urinib ko'ring",
          "info",
        );
        return;
      }
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      console.error(err);
      toast.push("Mos dardkash qidirishda xato yuz berdi", "error");
    } finally {
      setSearching(false);
    }
  }

  if (loading) {
    return (
      <div className="px-6 py-20 text-center text-kul/50">
        {t("greeting", { name: "..." })}
      </div>
    );
  }

  const needsTelegram =
    !me?.telegram_id &&
    (me?.listener_status === "approved" || me?.listener_status === "pending");

  const statusLabel =
    me?.listener_status === "approved"
      ? t("statusApproved")
      : me?.listener_status === "pending"
        ? t("statusPending")
        : me?.listener_status === "rejected"
          ? t("statusRejected")
          : null;

  return (
    <section className="bg-sahar px-6 py-14">
      {incomingCall && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-tun-deep/70 px-6">
          <div className="w-full max-w-sm rounded-wave bg-sahar p-7 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-barg/15 text-3xl animate-pulseSoft">
              📞
            </div>
            <h2 className="mt-4 font-display text-lg text-kul">
              {t("incomingCallTitle")}
            </h2>
            <p className="mt-2 text-sm text-kul/60">
              {t("incomingCallBody", { name: incomingCall.speakerName })}
            </p>
            <div className="mt-6 flex gap-3">
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => respondToInvite(incomingCall.sessionId, false)}
              >
                {t("incomingCallDecline")}
              </Button>
              <Button
                className="flex-1"
                onClick={() => respondToInvite(incomingCall.sessionId, true)}
              >
                {t("incomingCallAccept")}
              </Button>
            </div>
          </div>
        </div>
      )}

      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl text-kul">
              {t("greeting", { name: me?.nickname || "..." })}
            </h1>
            {statusLabel && (
              <span className="mt-1 inline-block rounded-full bg-yulduz/15 px-3 py-1 text-xs font-semibold text-yulduz-dim">
                {statusLabel}
              </span>
            )}
          </div>

          <Button size="lg" onClick={startSearch} disabled={searching}>
            {searching ? t("searching") : t("findListener")}
          </Button>
        </div>

        {needsTelegram && (
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-semibold text-kul">{t("telegramBannerTitle")}</p>
              <p className="mt-1 text-sm text-kul/70">{t("telegramBannerBody")}</p>
            </div>
            <Button
              size="md"
              className="shrink-0"
              onClick={connectTelegram}
              disabled={linkingTelegram}
            >
              {linkingTelegram ? t("telegramConnecting") : t("telegramConnect")}
            </Button>
          </div>
        )}

        {incomingInvites.some((inv) => inv.status === "scheduled") && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">Sizga kelgan takliflar</h2>
            <div className="mt-5 space-y-3">
              {incomingInvites
                .filter((inv) => inv.status === "scheduled")
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-kul">
                      <b>{inv.speaker_nickname}</b> siz bilan suhbatlashishni xohlaydi
                    </span>
                    <div className="flex gap-2">
                      <Button
                        size="md"
                        className="flex-1 sm:flex-none"
                        onClick={() => respondToInvite(inv.id, true)}
                      >
                        Qabul qilish
                      </Button>
                      <Button
                        size="md"
                        variant="secondary"
                        className="flex-1 sm:flex-none"
                        onClick={() => respondToInvite(inv.id, false)}
                      >
                        Rad etish
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {incomingInvites.some((inv) => inv.status === "active") && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">Faol suhbatlaringiz</h2>
            <div className="mt-5 space-y-3">
              {incomingInvites
                .filter((inv) => inv.status === "active")
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-barg/30 bg-barg/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-kul">
                      <b>{inv.speaker_nickname}</b> bilan suhbat boshlangan
                    </span>
                    <Button
                      size="md"
                      className="w-full sm:w-auto"
                      onClick={() => router.push(`/session/${inv.id}`)}
                    >
                      Suhbatni boshlash
                    </Button>
                  </div>
                ))}
            </div>
          </>
        )}

        {sentInvites.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">Yuborgan takliflaringiz</h2>
            <div className="mt-5 space-y-3">
              {sentInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-3 rounded-2xl border border-kul/10 bg-white/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-kul">
                    <b>{inv.listener_nickname}</b> —{" "}
                    {inv.status === "active" ? "qabul qildi ✅" : "javob kutilmoqda ⏳"}
                  </span>
                  {inv.status === "active" && (
                    <Button
                      size="md"
                      className="w-full sm:w-auto"
                      onClick={() => router.push(`/session/${inv.id}`)}
                    >
                      Suhbatni boshlash
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        <h2 className="mt-12 font-display text-xl text-kul">
          {t("onlineListeners")}
        </h2>
        {listeners.length === 0 ? (
          <p className="mt-5 text-kul/50">{t("noSessions")}</p>
        ) : (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {listeners.map((listener) => (
              <ListenerCard
                key={listener.id}
                listener={listener}
                onStart={startSessionWith}
                onInvite={inviteListener}
              />
            ))}
          </div>
        )}

        <h2 className="mt-14 font-display text-xl text-kul">
          {t("recentSessions")}
        </h2>
        {recentSessions.length === 0 ? (
          <div className="mt-5 rounded-wave border border-dashed border-kul/20 bg-white/40 p-10 text-center text-kul/50">
            {t("noSessions")}
          </div>
        ) : (
          <ul className="mt-5 divide-y divide-kul/10 overflow-hidden rounded-2xl border border-kul/10 bg-white/60">
            {recentSessions.map((s) => {
              const minutes = s.ended_at
                ? Math.round(
                    (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000,
                  )
                : null;
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-4">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-barg/15 font-semibold text-barg">
                    {s.partner_nickname.trim().charAt(0).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-kul">
                      {s.partner_nickname}
                    </p>
                    <p className="mt-0.5 text-xs text-kul/55">
                      {s.my_role === "listener" ? t("recentYouListened") : t("recentYouTalked")}
                      {" · "}
                      {new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(new Date(s.started_at))}
                    </p>
                  </div>
                  {/* 4 soatdan uzun bo'lsa — bu tab yopilib "osilib qolgan"
                      va keyin avtomatik yopilgan suhbat, davomiyligi ma'nosiz. */}
                  {minutes !== null && minutes <= 240 && (
                    <span className="shrink-0 rounded-full bg-kul/5 px-3 py-1 text-xs text-kul/60">
                      {minutes < 1 ? t("recentUnderMinute") : t("recentMinutes", { count: minutes })}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
