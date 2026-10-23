"use client";

import { formatShortDate } from "@/lib/dates";
import { track } from "@/lib/analytics";
import PushPrompt from "@/components/call/PushPrompt";
import SpeakerMiniProfile from "@/components/profile/SpeakerMiniProfile";
import Avatar from "@/components/ui/Avatar";
import ShowMoreButton from "@/components/ui/ShowMoreButton";
import ListenerCard, {
  type ListenerSummary,
} from "@/components/dashboard/ListenerCard";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Link, useRouter } from "@/i18n/navigation";
import { NOTIFY_EVENT } from "@/components/call/CallNotifier";
import { formatHour } from "@/lib/availability";
import { openTelegramLink } from "@/lib/telegramLink";
import { Heart } from "lucide-react";
import { MOOD_AFTER_EMOJI, MOOD_BEFORE_EMOJI } from "@/lib/mood";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, type ReactNode } from "react";

const bold = (chunks: ReactNode) => <b>{chunks}</b>;

interface Me {
  nickname: string | null;
  listener_status: string | null;
  telegram_id: string | null;
  // Yangi tasdiqlangan dardkash — bir martalik "Tabriklaymiz" kartochkasi.
  listener_welcome?: boolean;
}

interface IncomingInvite {
  id: string;
  status: string;
  speaker_nickname: string;
  speaker_avatar: string | null;
  speaker_id: string;
  invite_message: string | null;
  created_at: string;
}

interface RecentSession {
  id: string;
  started_at: string;
  ended_at: string | null;
  my_role: "speaker" | "listener";
  partner_nickname: string;
  partner_avatar: string | null;
  rated: boolean;
  mood_before: number | null;
  mood_after: "worse" | "same" | "better" | "much_better" | null;
  partner_id: string;
  partner_favorite: boolean;
}

interface MyWaiting {
  id: string;
  created_at: string;
}

interface WaitingSpeaker {
  id: string;
  speaker_id: string;
  avatar: string | null;
  nickname: string;
  waiting_minutes: number;
  topics: string[];
}

interface Impact {
  sessionsCount: number;
  rating: number;
  thanksCount: number;
  helpedCount: number;
  thanks: { thanks: string; created_at: string; nickname: string }[];
}

interface SentInvite {
  id: string;
  status: string;
  listener_nickname: string;
}

const DASHBOARD_TABS = ["listeners", "invites", "history", "impact"] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

const LISTENERS_PAGE = 9;

export default function DashboardPage() {
  const t = useTranslations("dashboard");
  const tTopics = useTranslations("topics");
  const tDaysLong = useTranslations("daysLong");
  const tLetters = useTranslations("letters");
  const router = useRouter();
  const toast = useToast();

  const [me, setMe] = useState<Me | null>(null);
  const [listeners, setListeners] = useState<ListenerSummary[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<IncomingInvite[]>([]);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>([]);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  // Kutish navbati: `waitPrompt` — onlayn dardkash topilmagach taklif,
  // `myWaiting` — navbatdagi o'z yozuvim, `waitingSpeakers` — dardkash
  // sifatida men olishim mumkin bo'lganlar.
  const [waitPrompt, setWaitPrompt] = useState(false);
  const [myWaiting, setMyWaiting] = useState<MyWaiting | null>(null);
  const [waitingSpeakers, setWaitingSpeakers] = useState<WaitingSpeaker[]>([]);
  const [waitBusy, setWaitBusy] = useState(false);
  // Taklif oynasi: kimga va ixtiyoriy qisqa xabar.
  const [inviteTarget, setInviteTarget] = useState<ListenerSummary | null>(null);
  // Dardini aytuvchining mini-profili (faqat aloqadagi dardkashga).
  const [miniProfileId, setMiniProfileId] = useState<string | null>(null);
  // Tablar (?tab=... — havola orqali to'g'ridan-to'g'ri ochish mumkin; URL
  // ma'lumot yuklangach o'qiladi — useSearchParams statik build'da Suspense
  // talab qiladi).
  const [tab, setTab] = useState<DashboardTab>("listeners");
  const [listenerFilter, setListenerFilter] = useState<"all" | "online" | "favorites">("all");
  // Ro'yxat uzun bo'lib ketmasin: avval LISTENERS_PAGE ta, keyin "Yana".
  const [listenersShown, setListenersShown] = useState(LISTENERS_PAGE);
  const [inviteMessage, setInviteMessage] = useState("");
  // "invite" — taklif (ixtiyoriy xabar bilan), "message" — qo'ng'iroqsiz
  // yozishma (xabar majburiy, /api/conversations).
  const [inviteMode, setInviteMode] = useState<"invite" | "message">("invite");
  const [inviting, setInviting] = useState(false);
  // Tasdiqlangan dardkash uchun: suhbatlari, yordam bergani, rahmat xatlari.
  const [impact, setImpact] = useState<Impact | null>(null);
  // Xatlar: dardkashga javob kutayotgan ochiq xatlar soni va o'qilmagan javob bormi.
  const [letters, setLetters] = useState<{ open: number; hasNew: boolean }>({
    open: 0,
    hasNew: false,
  });
  // Onlayn dardkash topilmaganda: ular odatda qachon bo'sh bo'lishi.
  const [nextAvailable, setNextAvailable] = useState<{
    inHours: number;
    dayOffset: number;
    weekday: number;
    hour: number;
  } | null>(null);

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
          availability:
            l.available_days?.length && l.available_from !== null && l.available_to !== null
              ? { days: l.available_days, from: l.available_from, to: l.available_to }
              : null,
          isFavorite: Boolean(l.is_favorite),
          avatar: l.avatar ?? null,
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
      setHistoryHasMore(Boolean(data.hasMore));
    } catch (err) {
      console.error("So'nggi suhbatlarni yuklashda xato:", err);
    }
  }, []);

  async function loadMoreHistory() {
    setHistoryLoadingMore(true);
    try {
      const res = await fetch(`/api/sessions/recent?offset=${recentSessions.length}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(String(res.status));
      const data = await res.json();
      setRecentSessions((prev) => {
        const seen = new Set(prev.map((s) => s.id));
        return [...prev, ...(data.sessions || []).filter((s: RecentSession) => !seen.has(s.id))];
      });
      setHistoryHasMore(Boolean(data.hasMore));
    } catch {
      toast.push(t("loadError"), "error");
    } finally {
      setHistoryLoadingMore(false);
    }
  }

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

  const loadLetters = useCallback(async () => {
    try {
      const res = await fetch("/api/letters", { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      const active = (l: { status: string; has_new: boolean }) =>
        l.has_new && (l.status === "open" || l.status === "taken");
      setLetters({
        open: data.open.length,
        hasNew: data.mine.some(active) || data.assigned.some(active),
      });
    } catch (err) {
      console.error("Xatlarni yuklashda xato:", err);
    }
  }, []);

  const loadImpact = useCallback(async () => {
    try {
      const res = await fetch("/api/listener/impact", { credentials: "include" });
      if (res.ok) setImpact((await res.json()).impact ?? null);
    } catch (err) {
      console.error("Dardkash hissasini yuklashda xato:", err);
    }
  }, []);

  const loadWaitlist = useCallback(async () => {
    try {
      const [mineRes, listRes] = await Promise.all([
        fetch("/api/waitlist/me", { credentials: "include" }),
        fetch("/api/waitlist", { credentials: "include" }),
      ]);
      if (mineRes.ok) setMyWaiting((await mineRes.json()).waiting ?? null);
      if (listRes.ok) setWaitingSpeakers((await listRes.json()).waiting || []);
    } catch (err) {
      console.error("Navbatni yuklashda xato:", err);
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
        // Profili yo'q (masalan Google'dan birinchi marta qaytgan) — avval
        // ro'yxatdan o'tish. Avval u profilsiz kabinetga tushib, "Suhbatni
        // boshlash"ni bosa olardi va buzilgan suhbat sahifasiga tushardi.
        if (!meData.user?.nickname) {
          router.replace("/onboarding");
          return;
        }
        setMe(meData.user);
        const tabFromUrl = new URLSearchParams(window.location.search).get("tab");
        if (DASHBOARD_TABS.includes(tabFromUrl as DashboardTab)) {
          setTab(tabFromUrl as DashboardTab);
        }

        await Promise.all([
          loadListeners(),
          loadInvites(),
          loadRecentSessions(),
          loadWaitlist(),
          loadImpact(),
          loadLetters(),
        ]);
      } catch (err) {
        console.error(err);
        toast.push(t("loadError"), "error");
      } finally {
        setLoading(false);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    router,
    toast,
    loadInvites,
    loadListeners,
    loadRecentSessions,
    loadWaitlist,
    loadImpact,
    loadLetters,
  ]);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      loadListeners();
      loadWaitlist();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [loadListeners, loadWaitlist]);

  // Bildirishnoma socket'i, qo'ng'iroq modali va "onlayn" holati endi
  // butun sayt uchun CallNotifier'da (layout). Bu sahifa faqat hodisaga
  // javoban o'z ro'yxatlarini yangilaydi.
  useEffect(() => {
    function onNotify(event: Event) {
      const type = (event as CustomEvent).detail?.type;
      if (type === "listener_approved" || type === "listener_rejected") {
        reloadMe();
      } else if (type === "telegram_linked") {
        toast.push(t("telegramLinked"), "success");
        setLinkingTelegram(false);
        reloadMe();
      } else if (
        type === "waitlist_new" ||
        type === "waitlist_changed" ||
        type === "waitlist_expired"
      ) {
        loadWaitlist();
      } else if (type === "thanks_received") {
        loadImpact();
      } else if (typeof type === "string" && type.startsWith("letter_")) {
        loadLetters();
      } else if (type === "listener_found") {
        // Topilgan suhbat "Yuborgan takliflar"da ham ko'rinadi — modalda
        // "Keyinroq" bosilsa ham, kabinetdan qaytib kirish mumkin.
        loadWaitlist();
        loadInvites();
      } else {
        loadInvites();
      }
    }
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => window.removeEventListener(NOTIFY_EVENT, onNotify);
  }, [loadInvites, loadWaitlist, loadImpact, loadLetters, reloadMe, toast, t]);

  // Telegram ulanmagan dardkash offlayn paytida kelgan qo'ng'iroqlarni
  // bilmay qoladi — bot orqali bir martalik havola bilan ulaymiz. Oynani
  // fetch'dan OLDIN ochamiz: aks holda (await'dan keyin) mobil brauzerlar
  // uni popup deb bloklaydi.
  async function connectTelegram() {
    track("telegram_link_clicked", { from: "dashboard" });
    setLinkingTelegram(true);
    if (!(await openTelegramLink())) {
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
      if (!res.ok) throw new Error(data.message);
      track("call_started", { from: "card" });
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      console.error(err);
      toast.push(t("startError"), "error");
      setSearching(false);
    }
  }

  function inviteListener(listenerId: string) {
    setInviteMessage("");
    setInviteMode("invite");
    setInviteTarget(listeners.find((l) => l.id === listenerId) ?? null);
  }

  function messageListener(listenerId: string) {
    setInviteMessage("");
    setInviteMode("message");
    setInviteTarget(listeners.find((l) => l.id === listenerId) ?? null);
  }

  async function sendInvite() {
    if (!inviteTarget) return;
    setInviting(true);
    if (inviteMode === "message") {
      try {
        const res = await fetch("/api/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ listenerId: inviteTarget.id, message: inviteMessage }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
        setInviteTarget(null);
        track("message_started", { from: "card" });
        router.push(`/messages/${data.sessionId}`);
      } catch (err) {
        console.error(err);
        toast.push(t("inviteError"), "error");
      } finally {
        setInviting(false);
      }
      return;
    }
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listenerId: inviteTarget.id, message: inviteMessage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      toast.push(t("inviteSent"), "success");
      track("invite_sent", { with_message: Boolean(inviteMessage.trim()) });
      setInviteTarget(null);
      loadInvites();
    } catch (err) {
      console.error(err);
      toast.push(t("inviteError"), "error");
    } finally {
      setInviting(false);
    }
  }

  // Taklif xabari noqulay bo'lsa: shikoyat (admin'ga) va taklifni rad etish.
  async function reportInvite(invite: IncomingInvite) {
    try {
      const res = await fetch(`/api/session/${invite.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason: "abuse", details: invite.invite_message }),
      });
      if (!res.ok) throw new Error();
      await fetch(`/api/invites/${invite.id}/decline`, { method: "POST", credentials: "include" });
      toast.push(t("inviteReported"), "success");
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    }
    loadInvites();
  }

  async function respondToInvite(inviteId: string, accept: boolean) {
    try {
      const res = await fetch(`/api/invites/${inviteId}/${accept ? "accept" : "decline"}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (accept) {
        router.push(`/session/${inviteId}`);
      } else {
        toast.push(t("inviteDeclinedByYou"), "info");
        loadInvites();
      }
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
      loadInvites();
    }
  }

  async function cancelInvite(inviteId: string) {
    try {
      const res = await fetch(`/api/session/${inviteId}/end`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    }
    loadInvites();
  }

  async function joinWaitlist() {
    setWaitBusy(true);
    try {
      const res = await fetch("/api/waitlist", { method: "POST", credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      setMyWaiting(data.waiting);
      track("waitlist_joined");
      setWaitPrompt(false);
    } catch (err) {
      console.error(err);
      toast.push(t("waitJoinError"), "error");
    } finally {
      setWaitBusy(false);
    }
  }

  async function leaveWaitlist() {
    setWaitBusy(true);
    try {
      const res = await fetch("/api/waitlist/me", { method: "DELETE", credentials: "include" });
      if (!res.ok) throw new Error();
      setMyWaiting(null);
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    } finally {
      setWaitBusy(false);
    }
  }

  async function takeWaiting(waitlistId: string) {
    setWaitBusy(true);
    try {
      const res = await fetch(`/api/waitlist/${waitlistId}/take`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json();
      if (res.ok) {
        router.push(`/session/${data.sessionId}`);
        return;
      }
      toast.push(
        t(
          data.code === "taken"
            ? "waitlistTaken"
            : data.code === "busy"
              ? "waitlistBusy"
              : "waitlistGone",
        ),
        "info",
      );
      loadWaitlist();
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    } finally {
      setWaitBusy(false);
    }
  }

  async function toggleFavorite(listenerId: string, favorite: boolean) {
    try {
      const res = await fetch(`/api/favorites/${listenerId}`, {
        method: favorite ? "POST" : "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast.push(t(favorite ? "favoriteSaved" : "favoriteRemoved"), "success");
      setListeners((prev) =>
        prev.map((l) => (l.id === listenerId ? { ...l, isFavorite: favorite } : l)),
      );
      setRecentSessions((prev) =>
        prev.map((s) =>
          s.partner_id === listenerId && s.my_role === "speaker"
            ? { ...s, partner_favorite: favorite }
            : s,
        ),
      );
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    }
  }

  async function dismissWelcome() {
    setMe((prev) => (prev ? { ...prev, listener_welcome: false } : prev));
    fetch("/api/listener/welcome-seen", { method: "POST", credentials: "include" }).catch(() => {});
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
        if (res.status === 404) {
          track("find_listener", { result: "none_online" });
          setWaitPrompt(true);
          fetch("/api/listeners/next-available", { credentials: "include" })
            .then((r) => (r.ok ? r.json() : null))
            .then((d) => setNextAvailable(d?.next ?? null))
            .catch(() => {});
        }
        else toast.push(t("matchError"), "info");
        return;
      }
      track("find_listener", { result: "matched" });
      router.push(`/session/${data.sessionId}`);
    } catch (err) {
      console.error(err);
      toast.push(t("matchError"), "error");
    } finally {
      setSearching(false);
    }
  }

  function selectTab(value: DashboardTab) {
    setTab(value);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", value);
    window.history.replaceState(window.history.state, "", url);
  }

  const onlineCount = listeners.filter((l) => l.online).length;
  const favoriteCount = listeners.filter((l) => l.isFavorite).length;
  // Onlaynlar birinchi, keyin saqlanganlar.
  const visibleListeners = listeners
    .filter((l) =>
      listenerFilter === "online" ? l.online : listenerFilter === "favorites" ? l.isFavorite : true,
    )
    .sort(
      (a, b) => Number(b.online) - Number(a.online) || Number(b.isFavorite) - Number(a.isFavorite),
    );
  const tabs: [DashboardTab, string, number][] = [
    ["listeners", t("tabListeners"), onlineCount],
    ["invites", t("tabInvites"), sentInvites.length],
    ["history", t("tabHistory"), 0],
    ...(impact ? ([["impact", t("tabImpact"), 0]] as [DashboardTab, string, number][]) : []),
  ];

  if (loading) {
    // Matnsiz skelet: avval "Salom, ..." chiqib turardi — profilsiz
    // foydalanuvchi /onboarding'ga o'tishidan oldin kabinet bir lahza
    // ko'rinib qolardi.
    return (
      <section className="bg-sahar px-4 py-10 sm:px-6 sm:py-14" aria-busy="true">
        <div className="mx-auto max-w-6xl animate-pulse">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="h-8 w-56 rounded-lg bg-kul/10" />
            <div className="h-11 w-48 rounded-full bg-kul/10" />
          </div>
          <div className="mt-10 h-10 w-full max-w-md rounded-full bg-kul/10" />
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-40 rounded-2xl bg-kul/10" />
            ))}
          </div>
        </div>
      </section>
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
    <section className="bg-sahar px-4 py-10 sm:px-6 sm:py-14">
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

          <div className="flex flex-wrap gap-3">
            <Link
              href="/letters"
              className="inline-flex items-center justify-center rounded-full border border-kul/25 px-4 py-2.5 text-sm font-semibold text-kul transition-colors hover:border-barg/60 hover:text-barg"
            >
              ✉️ {tLetters("dashboardWrite")}
            </Link>
            <Button size="lg" onClick={startSearch} disabled={searching || Boolean(myWaiting)}>
              {searching ? t("searching") : t("findListener")}
            </Button>
          </div>
        </div>

        {incomingInvites.some((inv) => inv.status === "scheduled") && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">{t("incomingInvitesTitle")}</h2>
            <div className="mt-5 space-y-3">
              {incomingInvites
                .filter((inv) => inv.status === "scheduled")
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex min-w-0 gap-3">
                      <button
                        type="button"
                        onClick={() => setMiniProfileId(inv.speaker_id)}
                        aria-label={t("aboutSpeaker")}
                        className="shrink-0 self-start"
                      >
                        <Avatar code={inv.speaker_avatar} nickname={inv.speaker_nickname} size={40} />
                      </button>
                      <div className="min-w-0">
                      <span className="text-sm text-kul">
                        {t.rich("wantsToTalk", { name: inv.speaker_nickname, b: bold })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setMiniProfileId(inv.speaker_id)}
                        className="ml-2 text-xs font-semibold text-barg hover:underline"
                      >
                        {t("aboutSpeaker")}
                      </button>
                      {inv.invite_message && (
                        <p className="mt-1 whitespace-pre-line text-sm italic text-kul/70">
                          «{inv.invite_message}»
                        </p>
                      )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:items-end">
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <Button
                          size="md"
                          className="whitespace-nowrap"
                          onClick={() => respondToInvite(inv.id, true)}
                        >
                          {t("incomingCallAccept")}
                        </Button>
                        <Button
                          size="md"
                          variant="secondary"
                          className="whitespace-nowrap"
                          onClick={() => respondToInvite(inv.id, false)}
                        >
                          {t("incomingCallDecline")}
                        </Button>
                      </div>
                      {inv.invite_message && (
                        <div className="flex items-center justify-center gap-5 text-sm font-semibold sm:justify-end">
                          <Link href={`/messages/${inv.id}`} className="text-barg hover:underline">
                            {t("inviteReply")}
                          </Link>
                          <button
                            type="button"
                            onClick={() => reportInvite(inv)}
                            className="text-kul/55 hover:text-gisht hover:underline"
                          >
                            {t("inviteReport")}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}

        {incomingInvites.some((inv) => inv.status === "active") && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">{t("activeSessionsTitle")}</h2>
            <div className="mt-5 space-y-3">
              {incomingInvites
                .filter((inv) => inv.status === "active")
                .map((inv) => (
                  <div
                    key={inv.id}
                    className="flex flex-col gap-3 rounded-2xl border border-barg/30 bg-barg/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm text-kul">
                      {t.rich("sessionStartedWith", { name: inv.speaker_nickname, b: bold })}
                    </span>
                    <Button
                      size="md"
                      className="w-full sm:w-auto"
                      onClick={() => router.push(`/session/${inv.id}`)}
                    >
                      {t("joinSession")}
                    </Button>
                  </div>
                ))}
            </div>
          </>
        )}

        {myWaiting ? (
          <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-barg/30 bg-barg/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-3">
              <span className="mt-1 h-2.5 w-2.5 shrink-0 animate-pulseSoft rounded-full bg-barg" aria-hidden />
              <div>
                <p className="font-semibold text-kul">{t("waitingTitle")}</p>
                <p className="mt-1 text-sm text-kul/70">
                  {me?.telegram_id ? t("waitingBodyTelegram") : t("waitingBodyNoTelegram")}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 flex-col gap-2 sm:flex-row">
              {!me?.telegram_id && (
                <Button size="md" onClick={connectTelegram} disabled={linkingTelegram}>
                  {linkingTelegram ? t("telegramConnecting") : t("telegramConnect")}
                </Button>
              )}
              <Button size="md" variant="secondary" onClick={leaveWaitlist} disabled={waitBusy}>
                {t("waitCancel")}
              </Button>
            </div>
          </div>
        ) : (
          waitPrompt && (
            <div className="mt-8 flex flex-col gap-4 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-kul">{t("waitPromptTitle")}</p>
                <p className="mt-1 text-sm text-kul/70">{t("waitPromptBody")}</p>
                <Link
                  href="/letters"
                  className="mt-1 inline-block text-sm font-semibold text-barg hover:underline"
                >
                  {tLetters("waitPromptLetter")} →
                </Link>
                {nextAvailable && (
                  <p className="mt-2 text-sm font-medium text-kul">
                    {nextAvailable.inHours === 0
                      ? t("nextAvailableNow")
                      : nextAvailable.dayOffset === 0
                        ? t("nextAvailableToday", { hour: formatHour(nextAvailable.hour) })
                        : nextAvailable.dayOffset === 1
                          ? t("nextAvailableTomorrow", { hour: formatHour(nextAvailable.hour) })
                          : t("nextAvailableDay", {
                              day: tDaysLong(String(nextAvailable.weekday)),
                              hour: formatHour(nextAvailable.hour),
                            })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <Button size="md" variant="ghost" onClick={() => setWaitPrompt(false)}>
                  {t("waitDismiss")}
                </Button>
                <Button size="md" onClick={joinWaitlist} disabled={waitBusy}>
                  {t("waitJoin")}
                </Button>
              </div>
            </div>
          )
        )}

        {me?.listener_status === "approved" && waitingSpeakers.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">{t("waitlistTitle")}</h2>
            <p className="mt-1 text-sm text-kul/60">{t("waitlistSubtitle")}</p>
            <div className="mt-5 space-y-3">
              {waitingSpeakers.map((w) => (
                <div
                  key={w.id}
                  className="flex flex-col gap-3 rounded-2xl border border-barg/30 bg-barg/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <button
                    type="button"
                    onClick={() => setMiniProfileId(w.speaker_id)}
                    className="flex min-w-0 items-start gap-3 text-left"
                  >
                    <Avatar code={w.avatar} nickname={w.nickname} size={40} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-kul hover:text-barg hover:underline">{w.nickname}</p>
                    <p className="mt-0.5 text-xs text-kul/55">
                      {w.waiting_minutes < 1
                        ? t("waitlistJustNow")
                        : t("waitlistMinutes", { count: w.waiting_minutes })}
                    </p>
                    {w.topics.length > 0 && (
                      <p className="mt-1 text-xs text-kul/70">
                        {w.topics.map((code) => tTopics(code)).join(" · ")}
                      </p>
                    )}
                  </div>
                  </button>
                  <Button
                    size="md"
                    className="w-full shrink-0 sm:w-auto"
                    disabled={waitBusy}
                    onClick={() => takeWaiting(w.id)}
                  >
                    {t("waitlistTake")}
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Eslatmalar (xush kelibsiz, xatlar, push, Telegram) — shoshilinch
            narsalardan (kelgan taklif, boshlangan suhbat, navbat) KEYIN:
            avval to'rtta banner taklifni telefonda ikkinchi ekranga surardi. */}
        {me?.listener_welcome && (
          <div className="mt-8 rounded-2xl border border-barg/30 bg-barg/10 px-5 py-5">
            <p className="font-display text-lg text-kul">{t("welcomeTitle")}</p>
            <p className="mt-1 text-sm text-kul/70">{t("welcomeBody")}</p>
            <ol className="mt-3 space-y-2 text-sm text-kul">
              <li>
                1.{" "}
                <Link href="/onboarding?edit=1" className="font-semibold text-barg hover:underline">
                  {t("welcomeStep1")}
                </Link>
              </li>
              <li>
                2.{" "}
                <Link href="/guide" className="font-semibold text-barg hover:underline">
                  {t("welcomeStep2")}
                </Link>
              </li>
              <li>
                3.{" "}
                {me.telegram_id ? (
                  t("welcomeStep3Done")
                ) : (
                  <button
                    type="button"
                    onClick={connectTelegram}
                    disabled={linkingTelegram}
                    className="inline text-left font-semibold text-barg hover:underline"
                  >
                    {t("welcomeStep3")}
                  </button>
                )}
              </li>
            </ol>
            <Button size="md" className="mt-4" onClick={dismissWelcome}>
              {t("welcomeDismiss")}
            </Button>
          </div>
        )}

        {(letters.hasNew || (me?.listener_status === "approved" && letters.open > 0)) && (
          <Link
            href="/letters"
            className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-gisht/20 bg-gisht/5 px-5 py-3 text-sm text-kul hover:bg-gisht/10"
          >
            <span>
              ✉️{" "}
              {letters.hasNew
                ? tLetters("dashboardNewReplies")
                : tLetters("dashboardOpenLetters", { count: letters.open })}
            </span>
            <span aria-hidden>→</span>
          </Link>
        )}

        <PushPrompt variant="card" />

        {needsTelegram && (
          <div className="mt-4 flex flex-col gap-4 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
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

        {/* Ikkinchi darajali bo'limlar — tablar (avval hammasi ketma-ket
            tizilib, kabinet chalkash ko'rinardi). */}
        {/* Telefonda tablar sig'maydi — o'ng chetdagi soya yonga surish
            mumkinligini bildiradi. */}
        <div className="relative mt-12">
        <div
          role="tablist"
          className="flex gap-1 overflow-x-auto border-b border-kul/10 pr-6 [scrollbar-width:none] sm:pr-0"
        >
          {tabs.map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => selectTab(value)}
              className={`-mb-px flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-sm font-semibold transition-colors sm:px-4 ${
                tab === value
                  ? "border-barg text-kul"
                  : "border-transparent text-kul/55 hover:text-kul"
              }`}
            >
              {label}
              {count > 0 && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] ${
                    tab === value ? "bg-barg text-sahar" : "bg-kul/10 text-kul/70"
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          ))}
        </div>

          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-sahar sm:hidden"
          />
        </div>

        <div role="tabpanel" className="mt-6">
          {tab === "listeners" && (
            <>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", t("filterAll"), listeners.length],
              ["online", t("filterOnline"), onlineCount],
              ["favorites", t("filterFavorites"), favoriteCount],
            ] as const
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setListenerFilter(value);
                setListenersShown(LISTENERS_PAGE);
              }}
              aria-pressed={listenerFilter === value}
              className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                listenerFilter === value
                  ? "border-barg bg-barg text-sahar"
                  : "border-kul/20 text-kul/75 hover:border-barg/60"
              }`}
            >
              {label} <span className="opacity-70">{count}</span>
            </button>
          ))}
        </div>
        {visibleListeners.length === 0 ? (
          <p className="mt-5 rounded-2xl border border-dashed border-kul/20 bg-white/40 p-8 text-center text-sm text-kul/55">
            {listenerFilter === "favorites"
              ? t("emptyFavorites")
              : listenerFilter === "online"
                ? t("emptyOnline")
                : t("noSessions")}
          </p>
        ) : (
          <div className="mt-5 grid gap-5 md:grid-cols-3">
            {visibleListeners.slice(0, listenersShown).map((listener) => (
              <ListenerCard
                key={listener.id}
                listener={listener}
                onStart={startSessionWith}
                onInvite={inviteListener}
                onMessage={messageListener}
                onToggleFavorite={toggleFavorite}
              />
            ))}
          </div>
        )}
        {visibleListeners.length > listenersShown && (
          <ShowMoreButton
            onClick={() => setListenersShown((n) => n + LISTENERS_PAGE)}
            label={t("showMore", { count: visibleListeners.length - listenersShown })}
          />
        )}
            </>
          )}
          {tab === "invites" && (
            <>
        {sentInvites.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-kul/20 bg-white/40 p-8 text-center text-sm text-kul/55">
            {t("emptyInvites")}
          </p>
        ) : (
          <>
            <div className="space-y-3">
              {sentInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-3 rounded-2xl border border-kul/10 bg-white/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className="text-sm text-kul">
                    {t.rich(inv.status === "active" ? "sentAccepted" : "sentWaiting", {
                      name: inv.listener_nickname,
                      b: bold,
                    })}
                  </span>
                  {inv.status === "active" ? (
                    <Button
                      size="md"
                      className="w-full sm:w-auto"
                      onClick={() => router.push(`/session/${inv.id}`)}
                    >
                      {t("joinSession")}
                    </Button>
                  ) : (
                    <div className="flex gap-2">
                      <Link
                        href={`/messages/${inv.id}`}
                        className="inline-flex flex-1 items-center justify-center rounded-full px-4 py-2.5 text-sm font-semibold text-barg hover:bg-barg/10 sm:flex-none"
                      >
                        {t("sentChat")}
                      </Link>
                      <Button
                        size="md"
                        variant="secondary"
                        className="flex-1 sm:flex-none"
                        onClick={() => cancelInvite(inv.id)}
                      >
                        {t("inviteCancel")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
            </>
          )}
          {tab === "history" && (
            <>
        {(() => {
          // Dardini aytuvchi sifatida baholangan suhbatlar: nechtasidan keyin
          // yengillik his qilgan (FeedbackModal'dagi kayfiyat).
          const rated = recentSessions.filter((s) => s.my_role === "speaker" && s.mood_after);
          if (rated.length === 0) return null;
          const better = rated.filter(
            (s) => s.mood_after === "better" || s.mood_after === "much_better",
          ).length;
          return (
            <div className="mb-5 rounded-2xl border border-barg/20 bg-barg/5 px-5 py-4">
              <p className="font-semibold text-kul">{t("moodSummaryTitle")}</p>
              <p className="mt-1 text-sm text-kul/70">
                {t("moodSummary", { better, total: rated.length })}
              </p>
            </div>
          );
        })()}
        {recentSessions.length === 0 ? (
          <div className="rounded-wave border border-dashed border-kul/20 bg-white/40 p-10 text-center text-kul/50">
            {t("noSessions")}
          </div>
        ) : (
          <ul className="divide-y divide-kul/10 overflow-hidden rounded-2xl border border-kul/10 bg-white/60">
            {recentSessions.map((s) => {
              const minutes = s.ended_at
                ? Math.round(
                    (new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000,
                  )
                : null;
              return (
                <li key={s.id} className="flex items-center gap-4 px-5 py-4">
                  <Avatar code={s.partner_avatar} nickname={s.partner_nickname} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-kul">
                      {s.partner_nickname}
                    </p>
                    <p className="mt-0.5 text-xs text-kul/55">
                      {s.my_role === "listener" ? t("recentYouListened") : t("recentYouTalked")}
                      {" · "}
                      <span className="whitespace-nowrap">{formatShortDate(s.started_at)}</span>
                    </p>
                  </div>
                  {/* 4 soatdan uzun bo'lsa — bu tab yopilib "osilib qolgan"
                      va keyin avtomatik yopilgan suhbat, davomiyligi ma'nosiz. */}
                  {s.my_role === "speaker" && (
                    <button
                      type="button"
                      onClick={() => toggleFavorite(s.partner_id, !s.partner_favorite)}
                      aria-pressed={s.partner_favorite}
                      aria-label={s.partner_favorite ? t("favoriteRemove") : t("favoriteAdd")}
                      title={s.partner_favorite ? t("favoriteRemove") : t("favoriteAdd")}
                      className="shrink-0 rounded-full p-1.5 text-gisht transition-colors hover:bg-gisht/10"
                    >
                      <Heart size={16} fill={s.partner_favorite ? "currentColor" : "none"} />
                    </button>
                  )}
                  {s.my_role === "speaker" && (s.mood_before || s.mood_after) && (
                    <span
                      className="shrink-0 text-base"
                      title={t("moodBeforeAfter")}
                      aria-label={t("moodBeforeAfter")}
                    >
                      {s.mood_before ? MOOD_BEFORE_EMOJI[s.mood_before] : "·"}
                      {" → "}
                      {s.mood_after ? MOOD_AFTER_EMOJI[s.mood_after] : "·"}
                    </span>
                  )}
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
        {historyHasMore && (
          <ShowMoreButton
            onClick={loadMoreHistory}
            loading={historyLoadingMore}
            label={t("showMoreHistory")}
          />
        )}
            </>
          )}
          {tab === "impact" && impact && (
            <>
        {impact && (
          <div className="rounded-2xl border border-kul/10 bg-white/60 px-5 py-5">
            <p className="font-display text-lg text-kul">{t("impactTitle")}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              <span className="rounded-full bg-barg/10 px-3 py-1 text-kul">
                {t("impactSessions", { count: impact.sessionsCount })}
              </span>
              {impact.rating > 0 && (
                <span className="rounded-full bg-yulduz/15 px-3 py-1 text-yulduz-dim">
                  ★ {impact.rating.toFixed(1)}
                </span>
              )}
              {impact.helpedCount > 0 && (
                <span className="rounded-full bg-barg/10 px-3 py-1 text-kul">
                  {t("impactHelped", { count: impact.helpedCount })}
                </span>
              )}
              {impact.thanksCount > 0 && (
                <span className="rounded-full bg-gisht/10 px-3 py-1 text-kul">
                  💌 {t("impactThanks", { count: impact.thanksCount })}
                </span>
              )}
            </div>
            {impact.thanks.length > 0 && (
              <>
                <p className="mt-5 text-sm font-semibold text-kul/80">{t("impactThanksTitle")}</p>
                <ul className="mt-2 space-y-2">
                  {impact.thanks.map((item) => (
                    <li
                      key={item.created_at + item.nickname}
                      className="rounded-xl bg-sahar px-4 py-3 text-sm text-kul/80"
                    >
                      «{item.thanks}»
                      <span className="mt-1 block text-xs text-kul/50">— {item.nickname}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <Link
              href="/guide"
              className="mt-4 inline-block text-sm font-semibold text-barg hover:underline"
            >
              {t("impactGuide")} →
            </Link>
          </div>
        )}
            </>
          )}
        </div>
      </div>
      {miniProfileId && (
        <SpeakerMiniProfile userId={miniProfileId} onClose={() => setMiniProfileId(null)} />
      )}
      {inviteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-tun-deep/70 px-6">
          <div className="w-full max-w-md rounded-wave bg-sahar p-7">
            <h2 className="font-display text-xl text-kul">
              {t(inviteMode === "message" ? "messageModalTitle" : "inviteModalTitle", {
                name: inviteTarget.nickname,
              })}
            </h2>
            <label className="mt-5 block text-sm font-medium text-kul/80">
              {t(inviteMode === "message" ? "messageLabel" : "inviteMessageLabel")}
            </label>
            <textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder={t(
                inviteMode === "message" ? "messagePlaceholder" : "inviteMessagePlaceholder",
              )}
              rows={inviteMode === "message" ? 5 : 3}
              maxLength={inviteMode === "message" ? 1000 : 300}
              className="mt-2 w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 text-sm outline-none focus:border-barg"
            />
            <div className="mt-1 flex justify-between text-xs text-kul/50">
              <span>{t(inviteMode === "message" ? "messageNote" : "inviteMessageNote")}</span>
              <span className="shrink-0 pl-2">
                {[...inviteMessage].length} / {inviteMode === "message" ? 1000 : 300}
              </span>
            </div>
            <div className="mt-5 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setInviteTarget(null)}>
                {t("inviteModalCancel")}
              </Button>
              <Button
                className="flex-1"
                disabled={inviting || (inviteMode === "message" && !inviteMessage.trim())}
                onClick={sendInvite}
              >
                {t(inviteMode === "message" ? "messageSend" : "inviteModalSend")}
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
