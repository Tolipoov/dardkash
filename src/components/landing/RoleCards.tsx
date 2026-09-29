"use client";

import { ctaPrimarySmall, ctaYulduzOutline } from "@/components/landing/cta";
import { useLandingCta } from "@/components/landing/useLandingCta";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";

export default function RoleCards() {
  const t = useTranslations("landing");
  const { hrefFor } = useLandingCta();

  return (
    <section className="px-6 pb-26 pt-6 md:px-18">
      <h2 className="mb-3 font-display text-[40px] text-kul">{t("rolesTitle")}</h2>
      <p className="mb-12 text-[17px] text-kul/60">{t("rolesSubtitle")}</p>
      <div className="grid gap-6 md:grid-cols-2">
        <RoleCard
          tone="barg"
          title={t("roleSpeakerTitle")}
          text={t("roleSpeakerBody")}
          href={hrefFor("speaker")}
        />
        <RoleCard
          tone="yulduz"
          title={t("roleListenerTitle")}
          text={t("roleListenerBody")}
          href={hrefFor("listener")}
        />
      </div>
    </section>
  );
}

function RoleCard({
  tone,
  title,
  text,
  href,
}: {
  tone: "barg" | "yulduz";
  title: string;
  text: string;
  href: string;
}) {
  const isBarg = tone === "barg";
  const styles = isBarg
    ? { bg: "bg-barg-100", blob: "bg-barg/12", h: "text-barg-ink", p: "text-barg-ink-2" }
    : { bg: "bg-yulduz-100", blob: "bg-yulduz/16", h: "text-yulduz-ink", p: "text-yulduz-ink-2" };

  return (
    <div className={`relative flex flex-col gap-5 overflow-hidden rounded-[40px] p-8 md:p-12 ${styles.bg}`}>
      <div className={`absolute -right-[70px] -top-[70px] size-[220px] rounded-full ${styles.blob}`} />
      <h3 className={`relative font-display text-[32px] ${styles.h}`}>{title}</h3>
      <p className={`relative max-w-[440px] text-[17px] leading-relaxed ${styles.p}`}>{text}</p>
      <div className="relative mt-3">
        <Link href={href} className={isBarg ? ctaPrimarySmall : ctaYulduzOutline}>
          {title}
        </Link>
      </div>
    </div>
  );
}
