"use client";

import { NOTIFY_EVENT, UNREAD_CHANGED_EVENT } from "@/components/call/CallNotifier";
import ReportModal from "@/components/session/ReportModal";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const MAX_LENGTH = 2000;

interface Letter {
  id: string;
  status: "pending" | "open" | "taken" | "hidden" | "closed" | "expired" | "removed";
  author_id: string;
  listener_id: string | null;
  author_nickname: string;
  listener_nickname: string | null;
}

interface Message {
  id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export default function LetterPage() {
  const t = useTranslations("letters");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const letterId = useParams().id as string;
  const [role, setRole] = useState<"author" | "listener" | null>(null);
  const [letter, setLetter] = useState<Letter | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [confirm, setConfirm] = useState<null | "close" | "release" | "flag">(null);
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/letters/${letterId}`, { credentials: "include" });
      if (res.status === 401) {
        router.replace("/auth");
        return;
      }
      if (res.status === 404) {
        router.replace("/letters");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      // Xat ochilganda server uni o'qilgan deb belgilaydi — sarlavhadagi son.
      window.dispatchEvent(new Event(UNREAD_CHANGED_EVENT));
      setRole(data.role);
      setLetter(data.letter);
      setMessages(data.messages);
    } catch (err) {
      console.error("Xatni yuklashda xato:", err);
    }
  }, [letterId, router]);

  useEffect(() => {
    // Ma'lumot yuklash: setState faqat so'rov javobidan keyin chaqiriladi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    const onNotify = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.letterId === letterId) load();
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFY_EVENT, onNotify);
    };
  }, [load, letterId]);

  async function send() {
    setSending(true);
    try {
      const res = await fetch(`/api/letters/${letterId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: draft }),
      });
      if (!res.ok) throw new Error();
      setDraft("");
      load();
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setSending(false);
    }
  }

  async function act(action: "close" | "release" | "flag") {
    setConfirm(null);
    try {
      const res = await fetch(`/api/letters/${letterId}/${action}`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      if (action === "flag") toast.push(t("flagged"), "success");
      if (action === "release" || action === "flag") router.push("/letters");
      else load();
    } catch {
      toast.push(t("error"), "error");
    }
  }

  if (!letter || !role) return <section className="min-h-[60vh] bg-sahar" />;

  const myId = role === "author" ? letter.author_id : letter.listener_id;
  const partnerName = role === "author" ? letter.listener_nickname : letter.author_nickname;
  const canWrite =
    role === "author"
      ? ["pending", "open", "taken"].includes(letter.status)
      : letter.status === "taken";
  const dateFormat = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    day: "numeric",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <section className="bg-sahar px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <Link href="/letters" className="text-sm font-semibold text-barg hover:underline">
          ← {t("back")}
        </Link>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display text-2xl text-kul">
            {partnerName
              ? t("statusTaken", { name: partnerName })
              : letter.status === "pending" || letter.status === "hidden"
                ? t("statusPending")
                : letter.status === "removed"
                  ? t("statusRemoved")
                  : t("statusOpen")}
          </h1>
          <div className="flex gap-2">
            {partnerName && (
              <Button size="md" variant="ghost" onClick={() => setShowReport(true)}>
                {t("report")}
              </Button>
            )}
            {role === "author" && canWrite && (
              <Button size="md" variant="secondary" onClick={() => setConfirm("close")}>
                {t("close")}
              </Button>
            )}
            {role === "listener" && letter.status === "taken" && (
              <>
                <Button size="md" variant="ghost" onClick={() => setConfirm("flag")}>
                  {t("flag")}
                </Button>
                <Button size="md" variant="secondary" onClick={() => setConfirm("release")}>
                  {t("release")}
                </Button>
              </>
            )}
          </div>
        </div>

        {confirm && (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-yulduz/30 bg-yulduz/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-kul">
              {confirm === "close"
                ? t("closeConfirm")
                : confirm === "flag"
                  ? t("flagConfirm")
                  : t("releaseConfirm")}
            </p>
            <div className="flex gap-2">
              <Button size="md" variant="ghost" onClick={() => setConfirm(null)}>
                {t("confirmNo")}
              </Button>
              <Button size="md" onClick={() => act(confirm)}>
                {t("confirmYes")}
              </Button>
            </div>
          </div>
        )}

        <ul className="mt-6 space-y-3">
          {messages.map((m) => {
            const mineMessage = m.sender_id === myId;
            return (
              <li
                key={m.id}
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  mineMessage ? "ml-auto bg-barg/10" : "bg-white/70"
                }`}
              >
                <p className="text-xs text-kul/50">
                  {mineMessage ? t("you") : m.sender_id === letter.author_id ? letter.author_nickname : letter.listener_nickname}
                  {" · "}
                  {dateFormat.format(new Date(m.created_at))}
                </p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-kul/85">
                  {m.body}
                </p>
              </li>
            );
          })}
        </ul>

        {role === "author" && letter.status === "open" && (
          <p className="mt-6 rounded-2xl bg-barg/5 px-5 py-4 text-sm text-kul/70">
            {t("waitingListener")}
          </p>
        )}
        {role === "author" && letter.status === "pending" && (
          <p className="mt-6 rounded-2xl bg-yulduz/10 px-5 py-4 text-sm text-kul/70">
            {t("pendingNote")}
          </p>
        )}
        {role === "author" && letter.status === "hidden" && (
          <p className="mt-6 text-sm text-kul/60">{t("hiddenNote")}</p>
        )}
        {letter.status === "removed" && (
          <p className="mt-6 text-sm text-kul/60">{t("removedNote")}</p>
        )}
        {letter.status === "closed" && (
          <p className="mt-6 text-sm text-kul/60">{t("closed")}</p>
        )}
        {letter.status === "expired" && (
          <p className="mt-6 text-sm text-kul/60">{t("expired")}</p>
        )}

        {canWrite && (
          <div className="mt-6">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t("replyPlaceholder")}
              rows={4}
              maxLength={MAX_LENGTH}
              className="w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg"
            />
            <div className="mt-3 flex items-center justify-between gap-3">
              <span className="text-xs text-kul/50">
                {t("count", { count: [...draft].length, max: MAX_LENGTH })}
              </span>
              <Button disabled={sending || draft.trim().length === 0} onClick={send}>
                {sending ? t("sending") : t("send")}
              </Button>
            </div>
          </div>
        )}
      </div>

      {showReport && (
        <ReportModal
          endpoint={`/api/letters/${letterId}/report`}
          onClose={() => setShowReport(false)}
        />
      )}
    </section>
  );
}
