"use client";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePathname, useRouter } from "@/i18n/navigation";
import { resyncPush } from "@/lib/push";
import { buildWsUrl } from "@/lib/ws";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// Boshqa komponentlar (masalan dashboard) bildirishnomaga javoban o'z
// ro'yxatlarini yangilashi uchun — socket bitta, shu yerda.
export const NOTIFY_EVENT = "dardkash:notify";
// Xabar o'qilganda (yozishma/xat ochilganda) — sarlavhadagi o'qilmaganlar
// sonini yangilash uchun.
export const UNREAD_CHANGED_EVENT = "dardkash:unread-changed";
// Login holati o'zgarganda (masalan "Chiqish") socketni qayta sozlash uchun.
export const AUTH_CHANGED_EVENT = "dardkash:auth-changed";

// Login yo'q — qayta ulanish faqat cheksiz jim tsikl beradi.
const FATAL_CLOSE_CODE = 4001;

interface IncomingCall {
  sessionId: string;
  speakerName: string;
  // Taklif bilan yozilgan ixtiyoriy qisqa xabar.
  message: string | null;
}

// Navbatda turgan odamga dardkash topildi (server/src/waitlist.ts).
interface FoundListener {
  sessionId: string;
  listenerName: string;
}

// Qisqa "qo'ng'iroq" ovozi. Alohida audio fayl o'rniga Web Audio — brauzer
// foydalanuvchi hali sahifaga tegmagan bo'lsa ovozni bloklashi mumkin,
// shuning uchun bu faqat qo'shimcha signal (modal baribir chiqadi).
function startRinging(): () => void {
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  const audio = ctx;
  const beep = () => {
    if (audio.state !== "running") return;
    [0, 0.25].forEach((offset) => {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = 520;
      gain.gain.setValueAtTime(0.12, audio.currentTime + offset);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + offset + 0.2);
      osc.connect(gain).connect(audio.destination);
      osc.start(audio.currentTime + offset);
      osc.stop(audio.currentTime + offset + 0.2);
    });
    navigator.vibrate?.([200, 100, 200]);
  };
  audio.resume().then(beep).catch(() => {});
  const timer = setInterval(beep, 2000);
  return () => {
    clearInterval(timer);
    audio.close().catch(() => {});
  };
}

// Yozishmaga yangi xabar kelganda bitta yengil signal (qo'ng'iroqdagidek
// takrorlanmaydi). Brauzer hali ruxsat bermagan bo'lsa — jim o'tadi.
function playMessageChime() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 660;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.connect(gain).connect(ctx.destination);
    ctx
      .resume()
      .then(() => {
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
        setTimeout(() => ctx.close().catch(() => {}), 500);
      })
      .catch(() => ctx.close().catch(() => {}));
  } catch {
    // AudioContext yo'q — signal ixtiyoriy.
  }
}

// Saytda turgan, lekin yozishma oynasi yopiq odamga yangi xabar kartochkasi.
interface ChatPopup {
  sessionId: string;
  nickname: string;
  preview: string;
}
const CHAT_POPUP_MS = 20000;

// Butun saytda (layout'da) turadi: avval bildirishnoma socket'i va "onlayn"
// holati faqat dashboard sahifasida ishlardi — dardkash boshqa sahifada
// bo'lsa, oflayn ko'rinar va qo'ng'iroqni ko'rmasdi.
export default function CallNotifier() {
  const t = useTranslations("dashboard");
  const tLetters = useTranslations("letters");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [authVersion, setAuthVersion] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isApprovedListener, setIsApprovedListener] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [responding, setResponding] = useState(false);
  const [foundListener, setFoundListener] = useState<FoundListener | null>(null);
  const [chatPopup, setChatPopup] = useState<ChatPopup | null>(null);

  // Suhbat ichida yangi qo'ng'iroq modali chiqmaydi va dardkash "onlayn"
  // hisoblanmaydi (u band).
  const inSession = pathname.startsWith("/session/");
  const inSessionRef = useRef(inSession);
  useEffect(() => {
    inSessionRef.current = inSession;
  }, [inSession]);

  useEffect(() => {
    const onAuthChanged = () => setAuthVersion((v) => v + 1);
    window.addEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
    return () => window.removeEventListener(AUTH_CHANGED_EVENT, onAuthChanged);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        setLoggedIn(Boolean(data?.user));
        // Qurilmada push obunasi bo'lsa — joriy hisobga bog'laymiz.
        if (data?.user) resyncPush().catch(() => {});
        setIsApprovedListener(data?.user?.listener_status === "approved");
        if (!data?.user) setIncomingCall(null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authVersion]);

  useEffect(() => {
    if (!loggedIn) return;
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
            if (!inSessionRef.current) {
              setIncomingCall({
                sessionId: data.sessionId,
                speakerName: data.speakerName,
                message: data.message ?? null,
              });
            }
          } else if (data.type === "call_cancelled") {
            setIncomingCall((current) =>
              current?.sessionId === data.sessionId ? null : current,
            );
          } else if (data.type === "invite_accepted") {
            toast.push(t("inviteAccepted"), "success");
          } else if (data.type === "invite_declined") {
            toast.push(t("inviteDeclined"), "info");
          } else if (data.type === "listener_found") {
            setFoundListener({ sessionId: data.sessionId, listenerName: data.listenerName });
          } else if (data.type === "waitlist_new") {
            if (!inSessionRef.current) toast.push(t("waitlistNewToast"), "info");
          } else if (data.type === "waitlist_expired") {
            toast.push(t("waitlistExpired"), "info");
          } else if (data.type === "chat_message") {
            const path = window.location.pathname;
            // Shu yozishma allaqachon ochiq bo'lsa — kartochka shart emas.
            if (
              !path.endsWith(`/session/${data.sessionId}`) &&
              !path.endsWith(`/messages/${data.sessionId}`)
            ) {
              setChatPopup({
                sessionId: data.sessionId,
                nickname: data.nickname,
                preview: data.preview,
              });
              playMessageChime();
            }
          } else if (data.type === "letter_reply") {
            if (!window.location.pathname.endsWith(`/letters/${data.letterId}`)) {
              toast.push(tLetters("toastReply", { name: data.nickname }), "success");
            }
          } else if (data.type === "letter_new") {
            if (!inSessionRef.current) toast.push(tLetters("toastNew"), "info");
          } else if (data.type === "letter_closed") {
            toast.push(tLetters("toastClosed"), "info");
          } else if (data.type === "letter_removed") {
            toast.push(tLetters("toastRemoved"), "info");
          } else if (data.type === "letter_expired") {
            toast.push(tLetters("toastExpired"), "info");
          } else if (data.type === "thanks_received") {
            toast.push(t("thanksReceived", { name: data.nickname }), "success");
          } else if (data.type === "favorite_online") {
            if (!inSessionRef.current) {
              toast.push(t("favoriteOnline", { name: data.nickname }), "success");
            }
          }
          window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: data }));
        } catch (err) {
          console.error("Bildirishnoma xabarini o'qishda xato:", err);
        }
      };

      socket.onclose = (event) => {
        if (cancelled || event.code === FATAL_CLOSE_CODE) return;
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
  }, [loggedIn, authVersion]);

  // "Onlayn" holati: heartbeat har 30 soniyada (backend 90 soniyadan eski
  // heartbeat'ni oflayn deb hisoblaydi).
  const present = isApprovedListener && !inSession;
  useEffect(() => {
    if (!present) return;

    const sendOnline = () =>
      fetch("/api/listeners/presence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ online: true }),
      }).catch(() => {});
    const goOffline = () =>
      navigator.sendBeacon(
        "/api/listeners/presence",
        new Blob([JSON.stringify({ online: false })], { type: "application/json" }),
      );

    sendOnline();
    const heartbeat = setInterval(sendOnline, 30000);
    window.addEventListener("pagehide", goOffline);
    return () => {
      clearInterval(heartbeat);
      goOffline();
      window.removeEventListener("pagehide", goOffline);
    };
  }, [present]);

  const ringing = incomingCall !== null || foundListener !== null;

  // Kartochka o'zi yopiladi; yangi xabar kelsa, vaqt qaytadan boshlanadi.
  useEffect(() => {
    if (!chatPopup) return;
    const timer = setTimeout(() => setChatPopup(null), CHAT_POPUP_MS);
    return () => clearTimeout(timer);
  }, [chatPopup]);
  useEffect(() => {
    if (!ringing) return;
    return startRinging();
  }, [ringing]);

  async function respond(accept: boolean) {
    if (!incomingCall) return;
    const { sessionId } = incomingCall;
    setResponding(true);
    try {
      const res = await fetch(`/api/invites/${sessionId}/${accept ? "accept" : "decline"}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (accept) router.push(`/session/${sessionId}`);
      else toast.push(t("inviteDeclinedByYou"), "info");
    } catch (err) {
      console.error(err);
      toast.push(t("actionError"), "error");
    } finally {
      setIncomingCall(null);
      setResponding(false);
      window.dispatchEvent(new CustomEvent(NOTIFY_EVENT, { detail: { type: "invite_responded" } }));
    }
  }

  const popup = chatPopup && (
    <div
      role="status"
      className="fixed inset-x-3 bottom-4 z-[150] rounded-2xl border border-kul/10 bg-sahar p-4 shadow-xl sm:inset-x-auto sm:right-5 sm:w-80"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-barg/15 font-semibold text-barg">
          {chatPopup.nickname.trim().charAt(0).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-kul">{chatPopup.nickname}</p>
          <p className="mt-0.5 line-clamp-3 whitespace-pre-line text-sm text-kul/75">
            {chatPopup.preview}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setChatPopup(null)}
          aria-label={t("chatPopupClose")}
          className="-mr-1 -mt-1 rounded-full p-1.5 text-kul/40 hover:bg-kul/5 hover:text-kul"
        >
          ✕
        </button>
      </div>
      <Button
        size="md"
        className="mt-3 w-full"
        onClick={() => {
          const { sessionId } = chatPopup;
          setChatPopup(null);
          router.push(`/messages/${sessionId}`);
        }}
      >
        {t("chatPopupReply")}
      </Button>
    </div>
  );

  if (foundListener) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-tun-deep/70 px-6">
        <div className="w-full max-w-sm rounded-wave bg-sahar p-7 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-barg/15 text-3xl animate-pulseSoft">
            🎧
          </div>
          <h2 className="mt-4 font-display text-lg text-kul">{t("listenerFoundTitle")}</h2>
          <p className="mt-2 text-sm text-kul/60">
            {t("listenerFoundBody", { name: foundListener.listenerName })}
          </p>
          <div className="mt-6 flex gap-3">
            <Button variant="ghost" className="flex-1" onClick={() => setFoundListener(null)}>
              {t("listenerFoundLater")}
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                setFoundListener(null);
                router.push(`/session/${foundListener.sessionId}`);
              }}
            >
              {t("listenerFoundJoin")}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!incomingCall) return popup || null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-tun-deep/70 px-6">
      <div className="w-full max-w-sm rounded-wave bg-sahar p-7 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-barg/15 text-3xl animate-pulseSoft">
          📞
        </div>
        <h2 className="mt-4 font-display text-lg text-kul">{t("incomingCallTitle")}</h2>
        <p className="mt-2 text-sm text-kul/60">
          {t("incomingCallBody", { name: incomingCall.speakerName })}
        </p>
        {incomingCall.message && (
          <p className="mt-3 whitespace-pre-line rounded-xl bg-white/60 px-4 py-3 text-left text-sm italic text-kul/80">
            «{incomingCall.message}»
          </p>
        )}
        <div className="mt-6 flex gap-3">
          <Button
            variant="ghost"
            className="flex-1"
            disabled={responding}
            onClick={() => respond(false)}
          >
            {t("incomingCallDecline")}
          </Button>
          <Button className="flex-1" disabled={responding} onClick={() => respond(true)}>
            {t("incomingCallAccept")}
          </Button>
        </div>
      </div>
    </div>
  );
}
