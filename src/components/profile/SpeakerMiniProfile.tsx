"use client";

import Avatar from "@/components/ui/Avatar";
import Button from "@/components/ui/Button";
import TopicTag from "@/components/ui/TopicTag";
import { languageNames } from "@/lib/languages";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

interface MiniProfile {
  nickname: string;
  avatar: string | null;
  age_range: string;
  languages: string[];
  about: string | null;
  topics: string[];
}

// Dardini aytuvchining mini-profili — faqat u bilan aloqadagi dardkashga
// (server tekshiradi: GET /api/users/:id/mini-profile). Ommaviy sahifa yo'q.
export default function SpeakerMiniProfile({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}) {
  const t = useTranslations("profile");
  const tTopics = useTranslations("topics");
  const tLang = useTranslations("languageNames");
  const [profile, setProfile] = useState<MiniProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/users/${userId}/mini-profile`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data?.profile) setProfile(data.profile);
        else setFailed(true);
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-tun-deep/60 px-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-wave bg-sahar p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-wide text-kul/45">{t("speakerTitle")}</p>
        {failed && <p className="mt-4 text-sm text-kul/60">{t("notFound")}</p>}
        {profile && (
          <>
            <div className="mt-3 flex items-center gap-3">
              <Avatar code={profile.avatar} nickname={profile.nickname} size={52} />
              <div>
                <p className="font-display text-xl text-kul">{profile.nickname}</p>
                <p className="text-xs text-kul/55">
                  {t("ageRange", { range: profile.age_range })}
                  {profile.languages.length > 0 &&
                    ` · ${languageNames(profile.languages, tLang)}`}
                </p>
              </div>
            </div>
            {profile.topics.length > 0 && (
              <>
                <p className="mt-5 text-sm font-medium text-kul/80">{t("speakerTopics")}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {profile.topics.map((code) => (
                    <TopicTag key={code} label={tTopics(code)} />
                  ))}
                </div>
              </>
            )}
            {profile.about && (
              <>
                <p className="mt-5 text-sm font-medium text-kul/80">{t("speakerAbout")}</p>
                <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-kul/75">
                  {profile.about}
                </p>
              </>
            )}
            <p className="mt-5 text-xs text-kul/45">{t("speakerPrivacy")}</p>
          </>
        )}
        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </div>
  );
}
