"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import Button from "@/components/ui/Button";
import TopicTag from "@/components/ui/TopicTag";
import { useToast } from "@/components/ui/Toast";

interface PendingListener {
  user_id: string;
  nickname: string;
  phone: string;
  bio: string;
  topics: string[];
}

export default function ModerationPage() {
  const t = useTranslations("admin");
  const tTopics = useTranslations("topics");
  const toast = useToast();
  const router = useRouter();

  const [queue, setQueue] = useState<PendingListener[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listeners/pending", { credentials: "include" });
      if (res.status === 401) {
        router.push("/auth");
        return;
      }
      if (res.status === 403) {
        toast.push("Sizda bu sahifaga kirish huquqi yo'q", "error");
        router.push("/dashboard");
        return;
      }
      const data = await res.json();
      setQueue(data.pending || []);
    } catch (err) {
      console.error(err);
      toast.push("Ro'yxatni yuklashda xato", "error");
    } finally {
      setLoading(false);
    }
  }, [router, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function approve(userId: string) {
    try {
      const res = await fetch(`/api/admin/listeners/${userId}/approve`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      setQueue((q) => q.filter((item) => item.user_id !== userId));
      toast.push("Tasdiqlandi", "success");
    } catch {
      toast.push("Tasdiqlashda xato yuz berdi", "error");
    }
  }

  async function reject(userId: string) {
    try {
      const res = await fetch(`/api/admin/listeners/${userId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error();
      setQueue((q) => q.filter((item) => item.user_id !== userId));
      setRejectingId(null);
      setReason("");
      toast.push("Rad etildi", "success");
    } catch {
      toast.push("Rad etishda xato yuz berdi", "error");
    }
  }

  if (loading) {
    return <p className="px-6 py-20 text-center text-kul/50">{t("queueTitle")}...</p>;
  }

  return (
    <section className="min-h-screen bg-sahar px-6 py-14">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl text-kul">{t("queueTitle")}</h1>

        {queue.length === 0 ? (
          <p className="mt-10 text-kul/50">{t("queueEmpty")}</p>
        ) : (
          <div className="mt-8 space-y-5">
            {queue.map((item) => (
              <div key={item.user_id} className="rounded-wave border border-kul/10 bg-white/70 p-6">
                <div className="flex gap-5">
                  <div className="h-20 w-20 flex-shrink-0 rounded-2xl bg-kul/10" title={t("photo")} />
                  <div className="flex-1">
                    <h3 className="font-display text-lg text-kul">{item.nickname}</h3>
                    <p className="mt-1 text-sm text-kul/70">{item.bio}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.topics.map((code) => (
                        <TopicTag key={code} label={tTopics(code as any)} />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-kul/40">
                      {t("phoneAdminOnly")}: {item.phone}
                    </p>
                  </div>
                </div>

                {rejectingId === item.user_id ? (
                  <div className="mt-4 flex gap-2">
                    <input
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder={t("rejectReasonPlaceholder")}
                      className="flex-1 rounded-xl border border-kul/15 bg-white px-3 py-2 text-sm outline-none focus:border-gisht"
                    />
                    <Button variant="danger" disabled={!reason} onClick={() => reject(item.user_id)}>
                      {t("reject")}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-3">
                    <Button onClick={() => approve(item.user_id)}>{t("approve")}</Button>
                    <Button variant="ghost" onClick={() => setRejectingId(item.user_id)}>
                      {t("reject")}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
