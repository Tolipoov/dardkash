"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

export default function ReportModal({
  sessionId,
  onClose,
}: {
  sessionId: string;
  onClose: () => void;
}) {
  const t = useTranslations("session");
  const toast = useToast();
  const [reason, setReason] = useState<"abuse" | "inappropriate" | "other" | "">("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setSending(true);
    try {
      const res = await fetch(`/api/session/${sessionId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch (err) {
      console.error("Shikoyatni yuborishda xato:", err);
      toast.push("Shikoyatni yuborib bo'lmadi, qayta urinib ko'ring", "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-tun-deep/70 px-6">
      <div className="w-full max-w-sm rounded-wave bg-sahar p-7">
        {sent ? (
          <>
            <p className="py-6 text-center font-display text-lg text-kul">{t("reportSent")}</p>
            <Button className="w-full" variant="ghost" onClick={onClose}>
              {t("cancel")}
            </Button>
          </>
        ) : (
          <>
            <h2 className="font-display text-lg text-kul">{t("reportReasonTitle")}</h2>
            <div className="mt-4 flex flex-col gap-2">
              {(
                [
                  ["abuse", t("reportReasonAbuse")],
                  ["inappropriate", t("reportReasonInappropriate")],
                  ["other", t("reportReasonOther")],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setReason(value)}
                  className={`rounded-2xl border px-4 py-3 text-left text-sm ${
                    reason === value ? "border-gisht bg-gisht/10 text-kul" : "border-kul/15 text-kul/70"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={onClose}>
                {t("cancel")}
              </Button>
              <Button variant="danger" className="flex-1" disabled={!reason || sending} onClick={submit}>
                {t("reportSubmit")}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
