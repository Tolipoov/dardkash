"use client";

import Button from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { disablePush, enablePush, getPushState, type PushState } from "@/lib/push";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const DISMISS_KEY = "dardkash:push-dismissed";

// Brauzer push-bildirishnomalarini yoqish. `card` — kabinetdagi banner
// (yoqilgan yoki yopilgan bo'lsa ko'rinmaydi), `settings` — profil
// tahrirlashdagi doimiy bo'lim (yoqish/o'chirish).
export default function PushPrompt({ variant }: { variant: "card" | "settings" }) {
  const t = useTranslations("push");
  const toast = useToast();
  const [state, setState] = useState<PushState | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPushState()
      .then((s) => {
        if (cancelled) return;
        setState(s);
        setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
      })
      .catch(() => !cancelled && setState("unsupported"));
    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const next = await enablePush();
      setState(next);
      if (next === "on") toast.push(t("enabled"), "success");
      else if (next === "denied") toast.push(t("deniedToast"), "info");
    } catch (err) {
      console.error(err);
      toast.push(t("error"), "error");
    } finally {
      setBusy(false);
    }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush();
    setState("off");
    setBusy(false);
  }

  if (!state || state === "unsupported") return null;

  if (variant === "card") {
    if (state === "on" || dismissed) return null;
    return (
      <div className="mt-8 flex flex-col gap-3 rounded-2xl border border-barg/30 bg-barg/5 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Bell className="mt-0.5 shrink-0 text-barg" size={20} aria-hidden />
          <div>
            <p className="font-semibold text-kul">{t("title")}</p>
            <p className="mt-1 text-sm text-kul/70">
              {state === "ios-install" ? t("iosHint") : state === "denied" ? t("deniedHint") : t("body")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button
            size="md"
            variant="ghost"
            onClick={() => {
              localStorage.setItem(DISMISS_KEY, "1");
              setDismissed(true);
            }}
          >
            {t("later")}
          </Button>
          {state === "off" && (
            <Button size="md" onClick={turnOn} disabled={busy}>
              {t("enable")}
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium text-kul/80">{t("settingsTitle")}</p>
        <p className="mt-1 text-xs text-kul/55">
          {state === "on"
            ? t("onHint")
            : state === "ios-install"
              ? t("iosHint")
              : state === "denied"
                ? t("deniedHint")
                : t("body")}
        </p>
      </div>
      {state === "off" && (
        <Button size="md" className="shrink-0" onClick={turnOn} disabled={busy}>
          {t("enable")}
        </Button>
      )}
      {state === "on" && (
        <Button size="md" variant="secondary" className="shrink-0" onClick={turnOff} disabled={busy}>
          {t("disable")}
        </Button>
      )}
    </div>
  );
}
