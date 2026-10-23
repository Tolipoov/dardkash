import { Heart, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import TopicTag from "@/components/ui/TopicTag";
import { formatDays, formatHour, type Availability } from "@/lib/availability";
import { listenerBadge } from "@/lib/listenerBadge";

export interface ListenerSummary {
  id: string;
  nickname: string;
  ageRange: string;
  topics: string[];
  rating: number;
  sessionsCount: number;
  online: boolean;
  availability: Availability | null;
  isFavorite: boolean;
  avatar: string | null;
}

const MOBILE_TOPICS = 3;

export default function ListenerCard({
  listener,
  onStart,
  onInvite,
  onMessage,
  onToggleFavorite,
}: {
  listener: ListenerSummary;
  onStart: (id: string) => void;
  onInvite: (id: string) => void;
  // Qo'ng'iroqsiz yozishma boshlash (onlayn bo'lsa ham).
  onMessage: (id: string) => void;
  onToggleFavorite: (id: string, favorite: boolean) => void;
}) {
  const t = useTranslations("dashboard");
  const tTopics = useTranslations("topics");
  const tDays = useTranslations("days");
  const { availability } = listener;
  const badge = listenerBadge(listener.sessionsCount, listener.rating);
  // Telefonda kartochka butun kenglikda — mavzular ko'p bo'lsa juda baland
  // bo'lib ketardi; u yerda 3 tasi + "+N", kattaroq ekranda hammasi.
  const extraTopics = Math.max(0, listener.topics.length - MOBILE_TOPICS);

  return (
    <div className="flex flex-col justify-between rounded-wave border border-kul/10 bg-white/70 p-4 sm:p-6">
      <div>
        <div className="flex items-center justify-between">
          {/* Taxallus va avatar — profil sahifasiga havola. Onlayn holati —
              avatar burchagidagi nuqta. */}
          <Link
            href={`/listeners/${listener.id}`}
            className="group flex min-w-0 items-center gap-3"
          >
            <span className="relative">
              <Avatar code={listener.avatar} nickname={listener.nickname} size={44} />
              <span
                aria-hidden
                className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-white ${
                  listener.online ? "bg-barg" : "bg-kul/25"
                }`}
              />
            </span>
            <h3 className="truncate font-display text-lg text-kul group-hover:text-barg group-hover:underline">
              {listener.nickname}, {listener.ageRange}
            </h3>
          </Link>
          <div className="flex items-center gap-2">
            {/* Baho yo'q bo'lsa "★ 0.0" ko'rsatilmaydi — yangi dardkash yomon ko'rinmasin. */}
            {listener.rating > 0 && (
              <span className="text-sm font-semibold text-yulduz-dim">★ {listener.rating.toFixed(1)}</span>
            )}
            <button
              type="button"
              onClick={() => onToggleFavorite(listener.id, !listener.isFavorite)}
              aria-pressed={listener.isFavorite}
              aria-label={listener.isFavorite ? t("favoriteRemove") : t("favoriteAdd")}
              title={listener.isFavorite ? t("favoriteRemove") : t("favoriteAdd")}
              className="rounded-full p-1.5 text-gisht transition-colors hover:bg-gisht/10"
            >
              <Heart size={18} fill={listener.isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        {/* "Yangi dardkash" belgisi bor bo'lsa "0 ta suhbat" takror bo'lardi. */}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-kul/40">
          {listener.online ? t("online") : t("offline")}
          {badge !== "new" && (
            <>
              <span aria-hidden>·</span>
              {t("sessionsCount", { count: listener.sessionsCount })}
            </>
          )}
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                badge === "experienced" ? "bg-yulduz/15 text-yulduz-dim" : "bg-barg/10 text-barg"
              }`}
            >
              {t(badge === "experienced" ? "badgeExperienced" : "badgeNew")}
            </span>
          )}
        </p>
        {availability && (
          <p className="mt-1 text-xs text-kul/60">
            {t("usuallyAvailable", {
              days: formatDays(availability.days, (d) => tDays(String(d)), t("everyDay")),
              hours: `${formatHour(availability.from)}–${formatHour(availability.to)}`,
            })}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {listener.topics.map((code, i) => (
            <span key={code} className={i >= MOBILE_TOPICS ? "hidden sm:contents" : "contents"}>
              <TopicTag label={tTopics(code)} />
            </span>
          ))}
          {extraTopics > 0 && (
            <span className="inline-flex items-center rounded-full px-2 py-1.5 text-sm text-kul/50 sm:hidden">
              +{extraTopics}
            </span>
          )}
        </div>
      </div>

      {/* Asosiy amal (qo'ng'iroq yoki taklif) va qo'ng'iroqsiz xabar — bir qatorda. */}
      <div className="mt-4 flex gap-2 sm:mt-5">
        {listener.online ? (
          <Button className="flex-1" onClick={() => onStart(listener.id)}>
            {t("startSession")}
          </Button>
        ) : (
          <Button className="flex-1" variant="secondary" onClick={() => onInvite(listener.id)}>
            {t("sendInvite")}
          </Button>
        )}
        <button
          type="button"
          onClick={() => onMessage(listener.id)}
          title={t("messageAction")}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border border-barg/40 bg-barg/5 px-4 text-sm font-semibold text-barg transition-colors hover:bg-barg/15"
        >
          <MessageCircle size={16} aria-hidden />
          {t("messageShort")}
        </button>
      </div>
    </div>
  );
}
