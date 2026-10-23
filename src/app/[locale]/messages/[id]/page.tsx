"use client";

import { formatShortDate } from "@/lib/dates";
import SpeakerMiniProfile from "@/components/profile/SpeakerMiniProfile";
import { useSessionChat } from "@/components/session/useSessionChat";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Link, useRouter } from "@/i18n/navigation";
import { SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface SessionInfo {
  id: string;
  status: "scheduled" | "active" | "ended" | "cancelled";
  speaker_id: string;
  listener_id: string;
  speaker_nickname: string;
  listener_nickname: string;
  speaker_avatar: string | null;
  listener_avatar: string | null;
}

// Taklif/suhbat yozishmasi oddiy sayt ko'rinishida — qo'ng'iroq
// sahifasiga kirmasdan. Xabarlar qo'ng'iroq ichidagi chat bilan bir xil
// (useSessionChat, /api/ws/chat).
export default function ConversationPage() {
  const t = useTranslations("messages");
  const router = useRouter();
  const toast = useToast();
  const sessionId = useParams().id as string;
  const [myId, setMyId] = useState<string | null>(null);
  const [info, setInfo] = useState<SessionInfo | null>(null);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSpeaker, setShowSpeaker] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const { messages, send, connectionError } = useSessionChat(sessionId, myId, undefined, true);

  const loadInfo = useCallback(async () => {
    try {
      const [meRes, infoRes] = await Promise.all([
        fetch("/api/me", { credentials: "include" }),
        fetch(`/api/session/${sessionId}`, { credentials: "include" }),
      ]);
      if (meRes.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!infoRes.ok) {
        router.replace("/messages");
        return;
      }
      setMyId((await meRes.json()).user?.id ?? null);
      setInfo((await infoRes.json()).session);
    } catch (err) {
      console.error("Yozishmani yuklashda xato:", err);
    }
  }, [router, sessionId]);

  // Holat (qabul qilindi, bekor qilindi) boshqa tomondan o'zgarishi mumkin.
  useEffect(() => {
    // Ma'lumot yuklash: setState faqat so'rov javobidan keyin chaqiriladi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadInfo();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") loadInfo();
    }, 10000);
    return () => clearInterval(timer);
  }, [loadInfo]);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages]);

  async function act(path: string, after: () => void) {
    setBusy(true);
    try {
      const res = await fetch(path, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      after();
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  if (!info || !myId) return <section className="min-h-[60vh] bg-sahar" />;

  const isListener = myId === info.listener_id;
  const partner = isListener ? info.speaker_nickname : info.listener_nickname;
  const partnerAvatar = isListener ? info.speaker_avatar : info.listener_avatar;
  const writable = info.status === "scheduled" || info.status === "active";
  const statusKey = {
    scheduled: "statusScheduled",
    active: "statusActive",
    ended: "statusEnded",
    cancelled: "statusCancelled",
  } as const;
  function submit() {
    if (send(input)) setInput("");
  }

  return (
    <section className="bg-sahar px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto flex max-w-3xl flex-col">
        <Link href="/messages" className="text-sm font-semibold text-barg hover:underline">
          ← {t("back")}
        </Link>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {/* Dardkashning profili ochiq; dardini aytuvchiniki — mini-profil. */}
            <button
              type="button"
              onClick={() =>
                isListener
                  ? setShowSpeaker(true)
                  : router.push(`/listeners/${info.listener_id}`)
              }
              className="flex items-center gap-3 text-left"
            >
              <Avatar code={partnerAvatar} nickname={partner} size={44} />
            </button>
            <div>
              <h1 className="font-display text-xl text-kul">
                <button
                  type="button"
                  onClick={() =>
                    isListener
                      ? setShowSpeaker(true)
                      : router.push(`/listeners/${info.listener_id}`)
                  }
                  className="hover:text-barg hover:underline"
                >
                  {partner}
                </button>
              </h1>
              <p className="text-xs text-kul/55">{t(statusKey[info.status])}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {info.status === "scheduled" && isListener && (
              <>
                <Button
                  size="md"
                  disabled={busy}
                  onClick={() =>
                    act(`/api/invites/${sessionId}/accept`, () =>
                      router.push(`/session/${sessionId}`),
                    )
                  }
                >
                  {t("accept")}
                </Button>
                <Button
                  size="md"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => act(`/api/invites/${sessionId}/decline`, loadInfo)}
                >
                  {t("decline")}
                </Button>
              </>
            )}
            {info.status === "scheduled" && !isListener && (
              <Button
                size="md"
                variant="secondary"
                disabled={busy}
                onClick={() => act(`/api/session/${sessionId}/end`, loadInfo)}
              >
                {t("cancelInvite")}
              </Button>
            )}
            {info.status === "active" && (
              <Button size="md" onClick={() => router.push(`/session/${sessionId}`)}>
                {t("joinCall")}
              </Button>
            )}
          </div>
        </div>

        <div
          ref={listRef}
          className="mt-6 h-[min(60dvh,560px)] space-y-2 overflow-y-auto rounded-2xl border border-kul/10 bg-white/60 p-4"
        >
          {connectionError && <p className="text-center text-xs text-gisht">{connectionError}</p>}
          {!connectionError && messages.length === 0 && (
            <p className="py-10 text-center text-sm text-kul/45">{t("threadEmpty")}</p>
          )}
          {messages.map((m) => {
            const mine = m.sender_id === myId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine ? "bg-barg text-sahar" : "bg-sahar-dim text-kul"
                  }`}
                >
                  <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.content}</p>
                  <p className={`mt-1 text-[11px] ${mine ? "text-sahar/70" : "text-kul/45"}`}>
                    {formatShortDate(m.created_at)}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {writable ? (
          <div className="mt-3 flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter — yuborish, Shift+Enter — yangi qator.
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={t("placeholder")}
              rows={2}
              maxLength={2000}
              // text-base (16px) telefonda — iOS kichik shriftli maydonga
              // bosilganda sahifani kattalashtirib yubormasligi uchun.
              className="min-w-0 flex-1 resize-none rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 text-base outline-none focus:border-barg sm:text-sm"
            />
            <button
              type="button"
              onClick={submit}
              aria-label={t("send")}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-barg text-sahar hover:bg-barg-dim"
            >
              <SendHorizontal size={20} />
            </button>
          </div>
        ) : (
          <p className="mt-3 text-sm text-kul/55">{t("readOnly")}</p>
        )}
      </div>
      {showSpeaker && (
        <SpeakerMiniProfile userId={info.speaker_id} onClose={() => setShowSpeaker(false)} />
      )}
    </section>
  );
}
