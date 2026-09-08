import { useTranslations } from "next-intl";
import Button from "@/components/ui/Button";
import TopicTag from "@/components/ui/TopicTag";

export interface ListenerSummary {
  id: string;
  nickname: string;
  ageRange: string;
  topics: string[];
  rating: number;
  sessionsCount: number;
  online: boolean;
}

export default function ListenerCard({
  listener,
  onStart,
  onInvite,
}: {
  listener: ListenerSummary;
  onStart: (id: string) => void;
  onInvite: (id: string) => void;
}) {
  const t = useTranslations("dashboard");
  const tTopics = useTranslations("topics");

  return (
    <div className="flex flex-col justify-between rounded-wave border border-kul/10 bg-white/70 p-6">
      <div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                listener.online ? "bg-barg" : "bg-kul/20"
              }`}
              aria-hidden
            />
            <h3 className="font-display text-lg text-kul">
              {listener.nickname}, {listener.ageRange}
            </h3>
          </div>
          <span className="text-sm font-semibold text-yulduz-dim">★ {listener.rating.toFixed(1)}</span>
        </div>

        <p className="mt-1 text-xs text-kul/40">
          {listener.online ? "Hozir onlayn" : "Hozir oflayn"}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {listener.topics.map((code) => (
            <TopicTag key={code} label={tTopics(code)} />
          ))}
        </div>
        <p className="mt-3 text-sm text-kul/50">
          {t("sessionsCount", { count: listener.sessionsCount })}
        </p>
      </div>

      {listener.online ? (
        <Button className="mt-5 w-full" onClick={() => onStart(listener.id)}>
          {t("startSession")}
        </Button>
      ) : (
        <Button
          className="mt-5 w-full"
          variant="secondary"
          onClick={() => onInvite(listener.id)}
        >
          Taklif yuborish
        </Button>
      )}
    </div>
  );
}
