"use client";

import ChatPanel from "@/components/session/ChatPanel";
import ControlBar from "@/components/session/ControlBar";
import FeedbackModal from "@/components/session/FeedbackModal";
import ReportModal from "@/components/session/ReportModal";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { useRouter } from "@/i18n/navigation";
import {
  RemoteParticipant,
  RemoteTrack,
  Room,
  RoomEvent,
  Track,
} from "livekit-client";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

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
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showReport, setShowReport] = useState(false);
  const [ended, setEnded] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);

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
      toast.push("Amalni bajarib bo'lmadi", "error");
    } finally {
      setResponding(false);
    }
  }

  // 3) Video/audio — FAQAT suhbat "active" bo'lgandagina ulanamiz
  useEffect(() => {
    if (!sessionInfo || sessionInfo.status !== "active") return;

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

        await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL as string, token);
        if (!active) return;

        try {
          await room.localParticipant.setCameraEnabled(true);
          const localVideoTrack = room.localParticipant.videoTrackPublications.values().next().value;
          if (localVideoTrack?.track && localVideoRef.current) {
            localVideoTrack.track.attach(localVideoRef.current);
          }
        } catch (camErr) {
          console.warn("Kamera topilmadi:", camErr);
          setCameraOn(false);
          toast.push("Kamera topilmadi — faqat audio bilan davom etyapsiz", "info");
        }

        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micErr) {
          console.warn("Mikrofon topilmadi:", micErr);
          setMicOn(false);
          toast.push("Mikrofon topilmadi", "info");
        }

        setConnecting(false);
      } catch (err) {
        console.error("LiveKit ulanish xatosi:", err);
        toast.push("Suhbatga ulanib bo'lmadi", "error");
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

  async function toggleCamera() {
    const next = !cameraOn;
    setCameraOn(next);
    await roomRef.current?.localParticipant.setCameraEnabled(next);
  }

  async function toggleMic() {
    const next = !micOn;
    setMicOn(next);
    await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
  }

  function enablePlayback() {
    remoteVideoRef.current?.play().catch(() => {});
    setNeedsTap(false);
  }

  async function confirmEnd() {
    await roomRef.current?.disconnect();
    setShowEndConfirm(false);
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
        <p className="text-sahar/50">Yuklanmoqda...</p>
      </section>
    );
  }

  if (!sessionInfo) {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center">
        <p className="text-sahar/70">Bu suhbat topilmadi yoki sizga tegishli emas.</p>
        <Button onClick={() => router.push("/dashboard")}>Bosh sahifaga qaytish</Button>
      </section>
    );
  }

  if (sessionInfo.status === "cancelled") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center px-6">
        <p className="text-sahar/70">Bu taklif rad etilgan.</p>
        <Button onClick={() => router.push("/dashboard")}>Bosh sahifaga qaytish</Button>
      </section>
    );
  }

  if (sessionInfo.status === "ended") {
    return (
      <section className="flex min-h-screen flex-col items-center justify-center gap-4 bg-tun text-center px-6">
        <p className="text-sahar/70">Bu suhbat allaqachon tugagan.</p>
        <Button onClick={() => router.push("/dashboard")}>Bosh sahifaga qaytish</Button>
      </section>
    );
  }

  if (ended) {
    return <FeedbackModal sessionId={sessionId} onSubmit={() => router.push("/dashboard")} />;
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
              <b>{otherName}</b> siz bilan suhbatlashishni xohlaydi
            </p>
            <div className="flex gap-3">
              <Button disabled={responding} onClick={() => respond(true)}>
                Qabul qilish
              </Button>
              <Button variant="ghost" disabled={responding} onClick={() => respond(false)}>
                Rad etish
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-lg text-sahar">
              <b>{otherName}</b>ga qo&apos;ng&apos;iroq qilinmoqda...
            </p>
            <p className="text-sm text-sahar/50">Kutilmoqda, javob berilishi bilan avtomatik boshlanadi</p>
          </>
        )}

        {myUserId && (
          <>
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="fixed bottom-8 left-6 flex h-12 w-12 items-center justify-center rounded-full bg-sahar/10 text-xl text-sahar backdrop-blur-sm hover:bg-sahar/20"
              aria-label="Yozishma"
            >
              💬
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

  // "active" — video/audio suhbat
  return (
    <section className="relative min-h-screen bg-tun">
      <div className="flex h-screen items-center justify-center">
        <div className="relative flex h-full w-full items-center justify-center bg-tun-deep">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="h-full w-full object-cover"
          />
          {connecting ? (
            <div className="absolute inset-0 flex items-center justify-center bg-tun-deep">
              <p className="font-sans text-sahar/60">{t("connecting")}</p>
            </div>
          ) : (
            !partnerConnected && (
              <div className="absolute inset-0 flex items-center justify-center text-center text-sahar/40">
                <div>
                  <div className="mx-auto mb-4 h-20 w-20 rounded-full bg-sahar/10" />
                  <p>{t("waitingForPartner")}</p>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="absolute bottom-28 right-6 h-40 w-28 overflow-hidden rounded-2xl border-2 border-sahar/20 bg-tun-deep shadow-lg md:h-56 md:w-40">
        {cameraOn ? (
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-center text-xs text-sahar/50">
            {t("cameraOff")}
          </div>
        )}
      </div>

      <div className="absolute left-1/2 top-6 -translate-x-1/2 rounded-full bg-sahar/10 px-4 py-2 text-xs text-sahar/70 backdrop-blur-sm">
        {t("crisisNote")}
      </div>

      <button
        onClick={() => setChatOpen((v) => !v)}
        className="absolute bottom-28 left-6 flex h-12 w-12 items-center justify-center rounded-full bg-sahar/10 text-xl text-sahar backdrop-blur-sm hover:bg-sahar/20"
        aria-label="Yozishma"
      >
        💬
      </button>

      {myUserId && (
        <ChatPanel
          sessionId={sessionId}
          myUserId={myUserId}
          open={chatOpen}
          onClose={() => setChatOpen(false)}
        />
      )}

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
        <ControlBar
          cameraOn={cameraOn}
          micOn={micOn}
          onToggleCamera={toggleCamera}
          onToggleMic={toggleMic}
          onEndCall={() => setShowEndConfirm(true)}
          onReport={() => setShowReport(true)}
        />
      </div>

      {showEndConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-tun-deep/70 px-6">
          <div className="w-full max-w-sm rounded-wave bg-sahar p-7 text-center">
            <h2 className="font-display text-lg text-kul">{t("confirmEndTitle")}</h2>
            <p className="mt-2 text-sm text-kul/60">{t("confirmEndBody")}</p>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setShowEndConfirm(false)}>
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
          className="fixed inset-0 z-40 flex items-center justify-center bg-tun-deep/80 text-sahar"
        >
          <span className="rounded-full bg-yulduz px-6 py-3 font-sans font-semibold text-tun-deep">
            Ovoz va videoni yoqish uchun bosing
          </span>
        </button>
      )}

      {showReport && <ReportModal sessionId={sessionId} onClose={() => setShowReport(false)} />}
    </section>
  );
}
