"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import TopicTag from "@/components/ui/TopicTag";

export default function FeedbackModal({
  sessionId,
  onSubmit,
}: {
  sessionId: string;
  onSubmit: () => void;
}) {
  const t = useTranslations("session");
  const [listened, setListened] = useState<"yes" | "partial" | "no" | "">("");
  const [mood, setMood] = useState<"worse" | "same" | "better" | "much_better" | "">("");
  const [comment, setComment] = useState("");
  const [sent, setSent] = useState(false);

  async function submit() {
    setSent(true);
    try {
      await fetch(`/api/session/${sessionId}/rating`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ listened, mood, comment }),
      });
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

            <Button className="mt-5 w-full" disabled={!listened || !mood} onClick={submit}>
              {t("feedbackSubmit")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
