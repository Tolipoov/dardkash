"use client";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { usePathname, useRouter } from "@/i18n/navigation";
import { buildWsUrl } from "@/lib/ws";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";

// Boshqa komponentlar (masalan dashboard) bildirishnomaga javoban o'z
// ro'yxatlarini yangilashi uchun — socket bitta, shu yerda.
export const NOTIFY_EVENT = "dardkash:notify";
// Login holati o'zgarganda (masalan "Chiqish") socketni qayta sozlash uchun.
export const AUTH_CHANGED_EVENT = "dardkash:auth-changed";

// Login yo'q — qayta ulanish faqat cheksiz jim tsikl beradi.
const FATAL_CLOSE_CODE = 4001;

interface IncomingCall {
  sessionId: string;
  speakerName: string;
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

// Butun saytda (layout'da) turadi: avval bildirishnoma socket'i va "onlayn"
// holati faqat dashboard sahifasida ishlardi — dardkash boshqa sahifada
// bo'lsa, oflayn ko'rinar va qo'ng'iroqni ko'rmasdi.
export default function CallNotifier() {
  const t = useTranslations("dashboard");
  const toast = useToast();
  const router = useRouter();
  const pathname = usePathname();

  const [authVersion, setAuthVersion] = useState(0);
  const [loggedIn, setLoggedIn] = useState(false);
  const [isApprovedListener, setIsApprovedListener] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [responding, setResponding] = useState(false);

  // Suhbat ichida yangi qo'ng'iroq modali chiqmaydi va dardkash "onlayn"
  // hisoblanmaydi (u band).
  const inSession = pathname.startsWith("/session/");
  const inSessionRef = useRef(inSession);
  inSessionRef.current = inSession;

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
              setIncomingCall({ sessionId: data.sessionId, speakerName: data.speakerName });
            }
          } else if (data.type === "call_cancelled") {
            setIncomingCall((current) =>
              current?.sessionId === data.sessionId ? null : current,
            );
          } else if (data.type === "invite_accepted") {
            toast.push(t("inviteAccepted"), "success");
          } else if (data.type === "invite_declined") {
            toast.push(t("inviteDeclined"), "info");
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

  const ringing = incomingCall !== null;
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

  if (!incomingCall) return null;

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
