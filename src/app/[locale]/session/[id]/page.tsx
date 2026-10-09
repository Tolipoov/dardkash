"use client";

import ChatPanel from "@/components/session/ChatPanel";
import ControlBar from "@/components/session/ControlBar";
import FeedbackModal from "@/components/session/FeedbackModal";
import ReportModal from "@/components/session/ReportModal";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "@/i18n/navigation";
import { MessageCircle } from "lucide-react";
import {
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

const bold = (chunks: ReactNode) => <b>{chunks}</b>;

interface SessionInfo {
  id: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  speaker_id: string;
  listener_id: string;
  speaker_nickname: string;
  listener_nickname: string;
}

export default function SessionPage() {
  const t = useTranslations("session");
  const router = useRouter();
  const params = useParams();
  const toast = useToast();
  const sessionId = params.id as string;

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const roomRef = useRef<Room | null>(null);
  const endTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState(true);
  const [responding, setResponding] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  const [connecting, setConnecting] = useState(true);
  const [partnerConnected, setPartnerConnected] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  // "end" — tugatish tugmasi bosildi; "leave" — brauzerning "orqaga"
  // tugmasi bosildi. Ikkalasida ham suhbat tasdiqsiz tugab qolmasin.
  const [confirmMode, setConfirmMode] = useState<null | "end" | "leave">(null);
  const [chatUnread, setChatUnread] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [ended, setEnded] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  // Shu sahifada suhbat haqiqatan bo'lib o'tdimi — suhbatni ikkinchi tomon
  // tugatganda ham baholash oynasini ko'rsatish uchun.
  const [wasInCall, setWasInCall] = useState(false);
  const [noAnswer, setNoAnswer] = useState(false);

  // 1) Kimligimizni bilamiz
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setMyUserId(data?.user?.id ?? null))
      .catch(() => {});
  }, []);

  // 2) Suhbat holatini yuklaymiz, va u "scheduled" bo'lsa, muntazam
  // tekshirib turamiz — ikkinchi tomon qabul qilishi bilan avtomatik
  // video bosqichiga o'tish uchun.
  useEffect(() => {
    let cancelled = false;

    async function fetchInfo() {
      try {
        const res = await fetch(`/api/session/${sessionId}`, { credentials: "include" });
        if (!res.ok) {
          if (!cancelled) setLoadingInfo(false);
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setSessionInfo(data.session);
          setLoadingInfo(false);
        }
      } catch {
        if (!cancelled) setLoadingInfo(false);
      }
    }

    fetchInfo();
    const poll = setInterval(fetchInfo, 3000);
    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [sessionId]);

  async function respond(accept: boolean) {
    setResponding(true);
    try {
      const res = await fetch(`/api/invites/${sessionId}/${accept ? "accept" : "decline"}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      const infoRes = await fetch(`/api/session/${sessionId}`, { credentials: "include" });
      const infoData = await infoRes.json();
      setSessionInfo(infoData.session);
    } catch {
      toast.push(t("actionError"), "error");
    } finally {
      setResponding(false);
    }
  }

  // 3) Video/audio — FAQAT suhbat "active" bo'lgandagina ulanamiz
  useEffect(() => {
    if (!sessionInfo || sessionInfo.status !== "active") return;
    setWasInCall(true);

    // Agar oldingi marta rejalashtirilgan "suhbatni tugatish" hali
    // yuborilmagan bo'lsa (pastdagi izohga qarang), bekor qilamiz — bu
    // effekt qayta ishga tushdi, demak suhbat haqiqatan tugamagan.
    if (endTimerRef.current) {
      clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }

    let active = true;
    const room = new Room();
    roomRef.current = room;
    const remoteVideoEl = remoteVideoRef.current;
    const localVideoEl = localVideoRef.current;

    async function connect() {
      try {
        const tokenRes = await fetch(`/api/session/${sessionId}/token`, {
          credentials: "include",
        });
        if (!tokenRes.ok) {
          const err = await tokenRes.json();
          throw new Error(err.message || "Token olinmadi");
        }
        const { token } = await tokenRes.json();

        room.on(
          RoomEvent.TrackSubscribed,
          (track: RemoteTrack, _pub, _participant: RemoteParticipant) => {
            if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
              track.attach(remoteVideoRef.current);
              setPartnerConnected(true);
              remoteVideoRef.current.play().catch(() => setNeedsTap(true));
            }
            if (track.kind === Track.Kind.Audio) {
              const el = track.attach();
              el.play?.().catch(() => setNeedsTap(true));
            }
          },
        );

        room.on(RoomEvent.ParticipantDisconnected, () => {
          setPartnerConnected(false);
        });

        // Kamera o'chirib-yoqilganda LiveKit yangi trek chiqaradi — uni
        // har safar kichik (o'z) ekranga qayta ulaymiz.
        room.on(RoomEvent.LocalTrackPublished, (pub) => {
          if (pub.source === Track.Source.Camera) attachLocalCamera(room);
        });

        await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL as string, token);
        if (!active) return;

        try {
          await room.localParticipant.setCameraEnabled(true);
          attachLocalCamera(room);
        } catch (camErr) {
          console.warn("Kamera topilmadi:", camErr);
          setCameraOn(false);
          toast.push(t("noCamera"), "info");
        }

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micErr) {
          console.warn("Mikrofon topilmadi:", micErr);
          setMicOn(false);
          toast.push(t("noMic"), "info");
        }

        setConnecting(false);
      } catch (err) {
        console.error("LiveKit ulanish xatosi:", err);
        toast.push(t("connectError"), "error");
        setConnecting(false);
      }
    }

    connect();

    return () => {
      active = false;
      room.disconnect();
      if (remoteVideoEl) remoteVideoEl.srcObject = null;
      if (localVideoEl) localVideoEl.srcObject = null;

      // MUHIM: bu cleanup React'ning o'zi ham (Strict Mode'da, dev
      // rejimida) chaqiradi — mount → cleanup → qayta mount, hammasi bir
      // zumda. Avval bu yerda darhol "/end" so'rovi yuborilardi, ya'ni
      // suhbat "npm run dev" bilan sinalganda boshlanishi bilanoq
      // "tugagan" deb belgilanardi. Endi biroz kechiktirib yuboramiz —
      // agar effekt darhol qayta ishga tushsa (yuqoridagi
      // clearTimeout), demak bu haqiqiy tugash emas edi.
      endTimerRef.current = setTimeout(() => {
        navigator.sendBeacon(`/api/session/${sessionId}/end`, new Blob());
      }, 300);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionInfo?.status, sessionId]);

  // Brauzer tabini yopish/yangilash — component cleanup bunga ishonchli
  // ishlamaydi, shuning uchun alohida `pagehide` orqali ham yopamiz.
  useEffect(() => {
    function handlePageHide() {
      navigator.sendBeacon(`/api/session/${sessionId}/end`, new Blob());
    }
    window.addEventListener("pagehide", handlePageHide);
    return () => window.removeEventListener("pagehide", handlePageHide);
  }, [sessionId]);

  // O'z videomizni kichik ekranga ulaydi. Avval <video> faqat kamera
  // yoqilganda render qilinardi va trek faqat bir marta, ulanish paytida
  // ulanardi — kamera o'chirib-yoqilgach yangi <video> elementi bo'sh
  // qolardi (o'zingizni ko'rmasdingiz). Endi element doim DOM'da.
  function attachLocalCamera(room: Room) {
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track && localVideoRef.current) {
      pub.track.attach(localVideoRef.current);
    }
  }

  async function toggleCamera() {
    const room = roomRef.current;
    const next = !cameraOn;
    setCameraOn(next);
    try {
      await room?.localParticipant.setCameraEnabled(next);
      if (next && room) attachLocalCamera(room);
    } catch (err) {
      console.warn("Kamerani almashtirib bo'lmadi:", err);
      setCameraOn(!next);
      toast.push(t("cameraError"), "error");
    }
  }

  async function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
    } catch (err) {
      console.warn("Mikrofonni almashtirib bo'lmadi:", err);
      setMicOn(!next);
      toast.push(t("micError"), "error");
    }
  }

  function enablePlayback() {
    remoteVideoRef.current?.play().catch(() => {});
    setNeedsTap(false);
  }

  // Suhbat paytida sahifadan tasodifan chiqib ketmaslik uchun:
  // - "orqaga" tugmasi (telefonda ayniqsa oson bosiladi) — tarixga bitta
  //   qo'shimcha yozuv qo'yamiz; u bosilganda sahifada qolib, tasdiqlash
  //   oynasini ko'rsatamiz. Next.js'ning o'z state'ini saqlab qo'yamiz,
  //   aks holda router popstate'da sahifani to'liq qayta yuklaydi;
  // - tab'ni yopish/yangilash — brauzerning o'z "chiqasizmi?" oynasi.
  const inCall = sessionInfo?.status === "active" && !ended;
  useEffect(() => {
    if (!inCall) return;
    window.history.pushState(
      { ...window.history.state, dardkashCall: true },
      "",
      window.location.href,
    );
    function onPopState() {
      window.history.pushState(
        { ...window.history.state, dardkashCall: true },
        "",
        window.location.href,
      );
      setConfirmMode("leave");
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [inCall]);

  // Qo'ng'iroq qilgan tomon javobni cheksiz kutib qolmasin: bir daqiqadan
  // keyin "javob bermayapti" eslatmasi chiqadi (bekor qilish tugmasi doim bor).
  const scheduled = sessionInfo?.status === "scheduled";
  useEffect(() => {
    if (!scheduled) return;
    setNoAnswer(false);
    const timer = setTimeout(() => setNoAnswer(true), 60000);
    return () => clearTimeout(timer);
  }, [scheduled]);

  async function cancelCall() {
    setResponding(true);
    try {
      await fetch(`/api/session/${sessionId}/end`, {
        method: "POST",
        credentials: "include",
      });
    } catch (err) {
      console.error("Qo'ng'iroqni bekor qilishda xato:", err);
    }
    router.push("/dashboard");
  }

  async function confirmEnd() {
    await roomRef.current?.disconnect();
    setConfirmMode(null);
    setEnded(true);
    fetch(`/api/session/${sessionId}/end`, {
      method: "POST",
      credentials: "include",
    }).catch((err) => console.error("Suhbatni tugatishda xato:", err));
  }

  // ===== Holatlar bo'yicha ekranlar =====

  if (loadingInfo) {
    return (
      <section className="flex min-h-screen items-center justify-center bg-tun">
        <p className="text-sahar/50">{t("loading")}</p>
      </section>
    );
  }

  if (!sessionInfo) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center">
        <p className="text-sahar/70">{t("notFound")}</p>
        <Button onClick={() => router.push("/dashboard")}>{t("backToDashboard")}</Button>
      </section>
    );
  }

  // Bu tekshiruv pastdagi "allaqachon tugagan" ekranidan OLDIN turishi
  // shart: avval 3 soniyalik poll suhbat `ended` bo'lganini ko'rishi bilan
  // baholash oynasi o'sha ekran bilan almashib, yo'qolib qolardi.
  if (ended || (wasInCall && sessionInfo.status === "ended")) {
    return <FeedbackModal sessionId={sessionId} onSubmit={() => router.push("/dashboard")} />;
  }

  if (sessionInfo.status === "cancelled") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center px-6">
        <p className="text-sahar/70">{t("callCancelled")}</p>
        <Button onClick={() => router.push("/dashboard")}>{t("backToDashboard")}</Button>
      </section>
    );
  }

  if (sessionInfo.status === "ended") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center px-6">
        <p className="text-sahar/70">{t("alreadyEnded")}</p>
        <Button onClick={() => router.push("/dashboard")}>{t("backToDashboard")}</Button>
      </section>
    );
  }

  const isListenerSide = myUserId === sessionInfo.listener_id;
  const otherName = isListenerSide ? sessionInfo.speaker_nickname : sessionInfo.listener_nickname;

  // "scheduled" — hali qabul qilinmagan
  if (sessionInfo.status === "scheduled") {
    return (
      <section className="relative flex min-h-screen flex-col items-center justify-center gap-6 bg-tun px-6 text-center">
        <div className="mx-auto h-20 w-20 rounded-full bg-sahar/10" />
        {isListenerSide ? (
          <>
            <p className="text-lg text-sahar">
              {t.rich("wantsToTalk", { name: otherName, b: bold })}
            </p>
            <div className="flex gap-3">
              <Button disabled={responding} onClick={() => respond(true)}>
                {t("accept")}
              </Button>
              <Button variant="ghost" disabled={responding} onClick={() => respond(false)}>
                {t("decline")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg text-sahar">
              {t.rich("calling", { name: otherName, b: bold })}
            </p>
            <p className="text-sm text-sahar/50">
              {noAnswer
                ? t("noAnswerHint")
                : t("waitingAnswer")}
            </p>
            <Button variant="ghost" disabled={responding} onClick={cancelCall}>
              {t("cancelCall")}
            </Button>
          </>
        )}

        {myUserId && (
          <>
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="fixed bottom-8 left-6 flex h-12 w-12 items-center justify-center rounded-full bg-sahar/10 text-sahar backdrop-blur-sm hover:bg-sahar/20"
              aria-label={t("chat")}
            >
              <MessageCircle size={22} />
            </button>
            <ChatPanel
              sessionId={sessionId}
              myUserId={myUserId}
              open={chatOpen}
              onClose={() => setChatOpen(false)}
            />
          </>
        )}
      </section>
    );
  }

  // "active" — video/audio suhbat. Butun ekran (100dvh) — sayt header'i
  // va footer'ini ham qoplaydi: suhbatdoshning videosi to'liq ekranda,
  // boshqaruv tugmalari pastda uning ustida.
  return (
    <section className="fixed inset-0 z-[60] h-[100dvh] overflow-hidden bg-tun-deep">
      <video
        ref={remoteVideoRef}
        autoPlay
        playsInline
        className="absolute inset-0 h-full w-full object-cover md:object-contain"
      />
      {connecting ? (
        <div className="absolute inset-0 flex items-center justify-center bg-tun-deep">
          <p className="font-sans text-sahar/60">{t("connecting")}</p>
        </div>
      ) : (
        !partnerConnected && (
          <div className="absolute inset-0 flex items-center justify-center text-center text-sahar/40">
            <div>
              <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-sahar/10 font-display text-2xl text-sahar/70">
                {otherName?.trim().charAt(0).toUpperCase()}
              </div>
              <p>{t("waitingForPartner")}</p>
            </div>
          </div>
        )
      )}

      {/* Yuqori qism: suhbatdosh ismi (va bo'lsa, kriziz eslatmasi) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/50 to-transparent px-4 pb-10 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex flex-col items-start gap-2 pr-28 sm:pr-44">
          <span className="rounded-full bg-black/30 px-3 py-1.5 text-sm font-semibold text-sahar backdrop-blur-sm">
            {otherName}
          </span>
          {t("crisisNote") && (
            <span className="rounded-full bg-black/30 px-3 py-1.5 text-xs text-sahar/80 backdrop-blur-sm">
              {t("crisisNote")}
            </span>
          )}
        </div>
      </div>

      {/* O'z videomiz — element doim DOM'da (kamera qayta yoqilganda
          trek unga qayta ulanadi), o'chiq bo'lsa ustidan yopiladi. */}
      <div className="absolute right-3 top-[max(0.75rem,env(safe-area-inset-top))] h-36 w-24 overflow-hidden rounded-2xl border border-sahar/20 bg-tun shadow-lg sm:right-5 sm:h-48 sm:w-36 md:h-56 md:w-40">
        <video
          ref={localVideoRef}
          autoPlay
          muted
          playsInline
          className="h-full w-full -scale-x-100 object-cover"
        />
        {!cameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-tun px-2 text-center text-xs text-sahar/50">
            {t("cameraOff")}
          </div>
        )}
      </div>

      {/* Pastki boshqaruv paneli */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent px-3 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-12">
        <ControlBar
          cameraOn={cameraOn}
          micOn={micOn}
          chatOpen={chatOpen}
          chatUnread={chatUnread}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onToggleChat={() => {
            setChatOpen((v) => !v);
            setChatUnread(false);
          }}
          onEndCall={() => setConfirmMode("end")}
          onReport={() => setShowReport(true)}
        />
      </div>

      {myUserId && (
        <ChatPanel
          sessionId={sessionId}
          myUserId={myUserId}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
          onIncoming={() => {
            if (!chatOpen) setChatUnread(true);
          }}
        />
      )}

      {confirmMode && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-tun-deep/70 px-6">
          <div className="w-full max-w-sm rounded-wave bg-sahar p-7 text-center">
            <h2 className="font-display text-lg text-kul">
              {confirmMode === "leave" ? t("leaveTitle") : t("confirmEndTitle")}
            </h2>
            <p className="mt-2 text-sm text-kul/60">
              {confirmMode === "leave" ? t("leaveBody") : t("confirmEndBody")}
            </p>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirmMode(null)}>
                {t("cancel")}
              </Button>
              <Button variant="danger" className="flex-1" onClick={confirmEnd}>
                {t("confirmEnd")}
              </Button>
            </div>
          </div>
        </div>
      )}

      {needsTap && (
        <button
          onClick={enablePlayback}
          className="fixed inset-0 z-[75] flex items-center justify-center bg-tun-deep/80 text-sahar"
        >
          <span className="rounded-full bg-yulduz px-6 py-3 font-sans font-semibold text-tun-deep">
            {t("tapToPlay")}
          </span>
        </button>
      )}

      {showReport && <ReportModal sessionId={sessionId} onClose={() => setShowReport(false)} />}
    </section>
  );
}
