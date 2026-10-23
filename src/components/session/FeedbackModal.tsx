"use client";

import { track } from "@/lib/analytics";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import TopicTag from "@/components/ui/TopicTag";

export default function FeedbackModal({
  sessionId,
  listenerId,
  onSubmit,
}: {
  sessionId: string;
  // Faqat dardini aytuvchi tomonida — dardkashni saqlash taklifi uchun.
  listenerId?: string;
  onSubmit: () => void;
}) {
  const t = useTranslations("session");
  const [listened, setListened] = useState<"yes" | "partial" | "no" | "">("");
  const [mood, setMood] = useState<"worse" | "same" | "better" | "much_better" | "">("");
  const [comment, setComment] = useState("");
  const [thanks, setThanks] = useState("");
  const [sent, setSent] = useState(false);
  const [alreadySaved, setAlreadySaved] = useState(true);
  const [saveListener, setSaveListener] = useState(false);

  useEffect(() => {
    if (!listenerId) return;
    fetch("/api/favorites", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setAlreadySaved(Boolean(data?.listenerIds?.includes(listenerId))))
      .catch(() => {});
  }, [listenerId]);

  async function submit() {
    setSent(true);
    // Faqat umumiy belgilar — izoh/rahmat matni yuborilmaydi.
    track("feedback_sent", { mood, listened, thanks: Boolean(thanks.trim()) });
    try {
      await fetch(`/api/session/${sessionId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listened, mood, comment, thanks: listenerId ? thanks : undefined }),
      });
      if (listenerId && saveListener) {
        await fetch(`/api/favorites/${listenerId}`, { method: "POST", credentials: "include" });
      }
    } catch (err) {
      console.error("Baholashni yuborishda xato:", err);
    }
    setTimeout(onSubmit, 900);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tun-deep/70 px-6">
      <div className="w-full max-w-md rounded-wave bg-sahar p-7">
        {sent ? (
          <p className="py-8 text-center font-display text-xl text-kul">{t("feedbackThanks")}</p>
        ) : (
          <>
            <h2 className="font-display text-xl text-kul">{t("feedbackTitle")}</h2>

            <p className="mt-5 text-sm font-medium text-kul/80">{t("feedbackListenedQ")}</p>
            <div className="mt-2 flex gap-2">
              <TopicTag as="button" label={t("feedbackYes")} selected={listened === "yes"} onClick={() => setListened("yes")} />
              <TopicTag as="button" label={t("feedbackPartial")} selected={listened === "partial"} onClick={() => setListened("partial")} />
              <TopicTag as="button" label={t("feedbackNo")} selected={listened === "no"} onClick={() => setListened("no")} />
            </div>

            <p className="mt-5 text-sm font-medium text-kul/80">{t("feedbackMoodQ")}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <TopicTag as="button" label={`😔 ${t("feedbackWorse")}`} selected={mood === "worse"} onClick={() => setMood("worse")} />
              <TopicTag as="button" label={`😐 ${t("feedbackSame")}`} selected={mood === "same"} onClick={() => setMood("same")} />
              <TopicTag as="button" label={`🙂 ${t("feedbackBetter")}`} selected={mood === "better"} onClick={() => setMood("better")} />
              <TopicTag as="button" label={`😊 ${t("feedbackMuchBetter")}`} selected={mood === "much_better"} onClick={() => setMood("much_better")} />
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder={t("feedbackComment")}
              rows={3}
              className="mt-5 w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 text-sm outline-none focus:border-barg"
            />

            {listenerId && (
              <>
                <p className="mt-5 text-sm font-medium text-kul/80">{t("feedbackThanksLabel")}</p>
                <textarea
                  value={thanks}
                  onChange={(e) => setThanks(e.target.value)}
                  placeholder={t("feedbackThanksPlaceholder")}
                  rows={2}
                  maxLength={300}
                  className="mt-2 w-full rounded-2xl border border-kul/15 bg-white/70 px-4 py-3 text-sm outline-none focus:border-barg"
                />
              </>
            )}

            {listenerId && !alreadySaved && (
              <label className="mt-4 flex items-center gap-2 text-sm text-kul/80">
                <input
                  type="checkbox"
                  checked={saveListener}
                  onChange={(e) => setSaveListener(e.target.checked)}
                  className="h-4 w-4 accent-barg"
                />
                {t("feedbackSaveListener")}
              </label>
            )}

            <Button className="mt-5 w-full" disabled={!listened || !mood} onClick={submit}>
              {t("feedbackSubmit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
