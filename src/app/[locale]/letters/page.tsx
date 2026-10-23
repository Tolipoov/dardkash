"use client";

import { track } from "@/lib/analytics";
import { NOTIFY_EVENT } from "@/components/call/CallNotifier";
import Button from "@/components/ui/Button";
import ShowMoreButton from "@/components/ui/ShowMoreButton";
import { useToast } from "@/components/ui/Toast";
import { Link, useRouter } from "@/i18n/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";

const MAX_LENGTH = 2000;

interface LetterSummary {
  id: string;
  status: "pending" | "open" | "taken" | "hidden" | "closed" | "expired" | "removed";
  created_at: string;
  last_message_at: string;
  preview: string;
  partner_nickname: string | null;
  has_new: boolean;
  last_sender_id: string;
}

interface OpenLetter {
  id: string;
  created_at: string;
  author_nickname: string;
  body: string;
  topics: string[];
}

const PAGE = 10;
type Section = "mine" | "assigned" | "open";

// "Xat" rejimi: yozma, kechikkan suhbat (server/src/letters.ts).
export default function LettersPage() {
  const t = useTranslations("letters");
  const tTopics = useTranslations("topics");
  const locale = useLocale();
  const router = useRouter();
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [mine, setMine] = useState<LetterSummary[]>([]);
  const [assigned, setAssigned] = useState<LetterSummary[]>([]);
  const [open, setOpen] = useState<OpenLetter[]>([]);
  // Har bo'lim alohida sahifalanadi; yangilanish ham shu sonlar bilan.
  const [limits, setLimits] = useState({ mine: PAGE, assigned: PAGE, open: PAGE });
  const [hasMore, setHasMore] = useState({ mine: false, assigned: false, open: false });
  const [loadingMore, setLoadingMore] = useState<Section | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        mine: String(limits.mine),
        assigned: String(limits.assigned),
        open: String(limits.open),
      });
      const res = await fetch(`/api/letters?${qs}`, { credentials: "include" });
      if (res.status === 401) {
        router.replace("/auth");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMine(data.mine);
      setAssigned(data.assigned);
      setOpen(data.open);
      if (data.hasMore) setHasMore(data.hasMore);
      setLoaded(true);
    } catch (err) {
      console.error("Xatlarni yuklashda xato:", err);
    } finally {
      setLoadingMore(null);
    }
  }, [router, limits]);

  function showMore(section: Section) {
    setLoadingMore(section);
    setLimits((prev) => ({ ...prev, [section]: prev[section] + PAGE }));
  }

  const moreButton = (section: Section) =>
    hasMore[section] && (
      <ShowMoreButton loading={loadingMore === section} onClick={() => showMore(section)} />
    );

  useEffect(() => {
    // Ma'lumot yuklash: setState faqat so'rov javobidan keyin chaqiriladi.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 20000);
    const onNotify = (event: Event) => {
      const type = (event as CustomEvent).detail?.type as string | undefined;
      if (type?.startsWith("letter_")) load();
    };
    window.addEventListener(NOTIFY_EVENT, onNotify);
    return () => {
      clearInterval(timer);
      window.removeEventListener(NOTIFY_EVENT, onNotify);
    };
  }, [load]);

  async function send() {
    setSending(true);
    try {
      const res = await fetch("/api/letters", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body: draft }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.push(
          data.code === "too_many"
            ? t("errorTooMany")
            : data.code === "no_profile"
              ? t("errorNoProfile")
              : data.code === "letters_blocked"
                ? t("errorBlocked", { date: dateFormat.format(new Date(data.until)) })
                : t("error"),
          "error",
        );
        return;
      }
      setDraft("");
      toast.push(data.pending ? t("sentPending") : t("sent"), "success");
      track("letter_sent", { first: Boolean(data.pending) });
      router.push(`/letters/${data.letterId}`);
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setSending(false);
    }
  }

  // Ochiq xatni olmasdan "spam" deb belgilash (ikki bosqichli tasdiq).
  const [flagging, setFlagging] = useState<string | null>(null);
  async function flag(id: string) {
    setFlagging(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/letters/${id}/flag`, { method: "POST", credentials: "include" });
      if (!res.ok) throw new Error();
      toast.push(t("flagged"), "success");
      load();
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function take(id: string) {
    setBusy(true);
    try {
      const res = await fetch(`/api/letters/${id}/take`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        router.push(`/letters/${id}`);
        return;
      }
      const data = await res.json().catch(() => ({}));
      toast.push(t(data.code === "taken" ? "takeTaken" : "takeGone"), "info");
      load();
    } catch {
      toast.push(t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  const dateFormat = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
    day: "numeric",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  function statusLabel(letter: LetterSummary) {
    if (letter.status === "pending" || letter.status === "hidden") return t("statusPending");
    if (letter.status === "removed") return t("statusRemoved");
    if (letter.status === "open") return t("statusOpen");
    if (letter.status === "taken") return t("statusTaken", { name: letter.partner_nickname ?? "" });
    if (letter.status === "closed") return t("statusClosed");
    return t("statusExpired");
  }

  function list(items: LetterSummary[]) {
    return (
      <ul className="mt-4 divide-y divide-kul/10 overflow-hidden rounded-2xl border border-kul/10 bg-white/60">
        {items.map((letter) => (
          <li key={letter.id}>
            <Link
              href={`/letters/${letter.id}`}
              className="flex items-start gap-3 px-5 py-4 hover:bg-white/80"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-kul">{letter.preview}</p>
                <p className="mt-1 text-xs text-kul/55">
                  {statusLabel(letter)} · {dateFormat.format(new Date(letter.last_message_at))}
                </p>
              </div>
              {letter.has_new && ["taken", "open"].includes(letter.status) && (
                <span className="shrink-0 rounded-full bg-gisht/10 px-2.5 py-1 text-[11px] font-semibold text-gisht">
                  {t("newBadge")}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }

  const length = [...draft].length;

  return (
    <section className="bg-sahar px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-kul">{t("pageTitle")}</h1>
        <p className="mt-3 text-kul/70">{t("intro")}</p>

        <div className="mt-8 rounded-2xl border border-kul/10 bg-white/60 p-5">
          <p className="font-semibold text-kul">{t("newTitle")}</p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t("newPlaceholder")}
            rows={6}
            maxLength={MAX_LENGTH}
            className="mt-3 w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 outline-none focus:border-barg"
          />
          <div className="mt-3 flex items-center justify-between gap-3">
            <span className="text-xs text-kul/50">
              {t("count", { count: length, max: MAX_LENGTH })}
            </span>
            <Button disabled={sending || draft.trim().length === 0} onClick={send}>
              {sending ? t("sending") : t("send")}
            </Button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-kul/55">{t("whoReads")}</p>
        </div>

        {open.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">{t("openTitle")}</h2>
            <p className="mt-1 text-sm text-kul/60">{t("openSubtitle")}</p>
            <div className="mt-4 space-y-3">
              {open.map((letter) => (
                <div key={letter.id} className="rounded-2xl border border-barg/30 bg-barg/5 p-5">
                  <p className="text-xs text-kul/55">
                    {t("from", { name: letter.author_nickname })} ·{" "}
                    {dateFormat.format(new Date(letter.created_at))}
                  </p>
                  {letter.topics.length > 0 && (
                    <p className="mt-1 text-xs text-kul/70">
                      {letter.topics.map((code) => tTopics(code)).join(" · ")}
                    </p>
                  )}
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-kul/85">
                    {letter.body}
                  </p>
                  {flagging === letter.id ? (
                    <div className="mt-4 flex flex-col gap-2 rounded-xl bg-yulduz/10 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-kul">{t("flagConfirm")}</p>
                      <div className="flex gap-2">
                        <Button size="md" variant="ghost" onClick={() => setFlagging(null)}>
                          {t("confirmNo")}
                        </Button>
                        <Button size="md" variant="danger" disabled={busy} onClick={() => flag(letter.id)}>
                          {t("confirmYes")}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button size="md" disabled={busy} onClick={() => take(letter.id)}>
                        {t("take")}
                      </Button>
                      <Button size="md" variant="ghost" onClick={() => setFlagging(letter.id)}>
                        {t("flag")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            {moreButton("open")}
          </>
        )}

        {assigned.length > 0 && (
          <>
            <h2 className="mt-12 font-display text-xl text-kul">{t("assignedTitle")}</h2>
            {list(assigned)}
            {moreButton("assigned")}
          </>
        )}

        <h2 className="mt-12 font-display text-xl text-kul">{t("mineTitle")}</h2>
        {loaded && mine.length === 0 ? (
          <p className="mt-4 text-sm text-kul/50">{t("empty")}</p>
        ) : (
          <>
            {list(mine)}
            {moreButton("mine")}
          </>
        )}
      </div>
    </section>
  );
}
