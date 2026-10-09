"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
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

interface Report {
  id: string;
  reason: "abuse" | "inappropriate" | "other";
  details: string | null;
  created_at: string;
  reporter_nickname: string | null;
  reported_nickname: string | null;
  reported_banned: boolean;
  reported_total: number;
}

interface BannedUser {
  user_id: string;
  nickname: string | null;
  banned_at: string;
}

const REASON_KEYS = {
  abuse: "reportReasonAbuse",
  inappropriate: "reportReasonInappropriate",
  other: "reportReasonOther",
} as const;

export default function ModerationPage() {
  const t = useTranslations("admin");
  const tSession = useTranslations("session");
  const locale = useLocale();
  const tTopics = useTranslations("topics");
  const toast = useToast();
  const router = useRouter();

  const [queue, setQueue] = useState<PendingListener[]>([]);
  const [loading, setLoading] = useState(true);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [banned, setBanned] = useState<BannedUser[]>([]);
  // Bloklash — jiddiy amal: birinchi bosishda faqat tasdiq so'raladi.
  const [banningId, setBanningId] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    try {
      const [reportsRes, bannedRes] = await Promise.all([
        fetch("/api/admin/reports", { credentials: "include" }),
        fetch("/api/admin/users/banned", { credentials: "include" }),
      ]);
      if (reportsRes.ok) setReports((await reportsRes.json()).reports || []);
      if (bannedRes.ok) setBanned((await bannedRes.json()).banned || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/listeners/pending", { credentials: "include" });
      if (res.status === 401) {
        router.push("/auth");
        return;
      }
      if (res.status === 403) {
        toast.push(t("noAccess"), "error");
        router.push("/dashboard");
        return;
      }
      const data = await res.json();
      setQueue(data.pending || []);
      await loadReports();
    } catch (err) {
      console.error(err);
      toast.push(t("loadError"), "error");
    } finally {
      setLoading(false);
    }
  }, [router, toast, loadReports, t]);

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
      toast.push(t("approved"), "success");
    } catch {
      toast.push(t("actionError"), "error");
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
      toast.push(t("rejected"), "success");
    } catch {
      toast.push(t("actionError"), "error");
    }
  }

  async function resolveReport(reportId: string, ban: boolean) {
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ban }),
      });
      if (!res.ok) throw new Error();
      setBanningId(null);
      toast.push(ban ? t("banDone") : t("reportClosed"), "success");
    } catch {
      toast.push(t("actionError"), "error");
    }
    loadReports();
  }

  async function unban(userId: string) {
    try {
      const res = await fetch(`/api/admin/users/${userId}/unban`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
      toast.push(t("unbanDone"), "success");
    } catch {
      toast.push(t("actionError"), "error");
    }
    loadReports();
  }

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "uz-UZ", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));

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

        <h2 className="mt-14 font-display text-2xl text-kul">{t("reportsTitle")}</h2>
        {reports.length === 0 ? (
          <p className="mt-6 text-kul/50">{t("reportsEmpty")}</p>
        ) : (
          <div className="mt-6 space-y-4">
            {reports.map((r) => (
              <div key={r.id} className="rounded-wave border border-gisht/25 bg-white/70 p-6">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="font-display text-lg text-kul">
                    {r.reported_nickname || "—"}
                  </h3>
                  <span className="text-xs text-kul/40">{formatDate(r.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-kul/70">
                  {tSession(REASON_KEYS[r.reason])}
                  {" · "}
                  {t("reportTotal", { count: r.reported_total })}
                </p>
                {r.details && (
                  <p className="mt-2 whitespace-pre-wrap text-sm text-kul [overflow-wrap:anywhere]">
                    {r.details}
                  </p>
                )}
                <p className="mt-2 text-xs text-kul/40">
                  {t("reportFrom", { name: r.reporter_nickname || "—" })}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  {r.reported_banned ? (
                    <span className="self-center text-sm text-gisht">{t("alreadyBanned")}</span>
                  ) : banningId === r.id ? (
                    <Button variant="danger" onClick={() => resolveReport(r.id, true)}>
                      {t("banConfirm")}
                    </Button>
                  ) : (
                    <Button variant="danger" onClick={() => setBanningId(r.id)}>
                      {t("ban")}
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => resolveReport(r.id, false)}>
                    {t("reportDismiss")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {banned.length > 0 && (
          <>
            <h2 className="mt-14 font-display text-2xl text-kul">{t("bannedTitle")}</h2>
            <ul className="mt-6 divide-y divide-kul/10 overflow-hidden rounded-2xl border border-kul/10 bg-white/60">
              {banned.map((u) => (
                <li key={u.user_id} className="flex items-center justify-between gap-4 px-5 py-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-kul">{u.nickname || "—"}</p>
                    <p className="mt-0.5 text-xs text-kul/50">{formatDate(u.banned_at)}</p>
                  </div>
                  <Button size="md" variant="secondary" onClick={() => unban(u.user_id)}>
                    {t("unban")}
                  </Button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}
