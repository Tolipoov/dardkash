import AnonymousQuoteCard from "@/components/landing/AnonymousQuoteCard";
import WaveDivider from "@/components/landing/WaveDivider";
import Button from "@/components/ui/Button";
import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

export default async function LandingPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "landing" });

  const steps = [
    { title: t("step1Title"), body: t("step1Body") },
    { title: t("step2Title"), body: t("step2Body") },
    { title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <>
      <section
        className="text-kul"
        style={{
          background:
            "radial-gradient(60% 70% at 15% 10%, rgba(255,252,242,0.9) 0%, rgba(255,252,242,0) 55%), " +
            "radial-gradient(55% 60% at 100% 100%, rgba(95,125,90,0.12) 0%, rgba(95,125,90,0) 60%), " +
            "#EDEAE2",
        }}
      >
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:py-28">
          <div>
            <p className="mb-5 font-sans text-sm font-semibold text-barg">
              {t("eyebrow")}
            </p>
            <h1 className="font-display text-3xl leading-tight md:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-md text-lg text-kul/70">{t("subtitle")}</p>

            <div className="mt-9 flex flex-wrap gap-4">
              <Link href="/onboarding?role=speaker">
                <Button size="lg" variant="primary">
                  {t("ctaSpeak")}
                </Button>
              </Link>
              <Link href="/onboarding?role=listener">
                <Button size="lg" variant="secondary">
                  {t("ctaListen")}
                </Button>
              </Link>
            </div>
            <p className="mt-5 text-sm text-kul/45">{t("trustNote")}</p>
          </div>

          <AnonymousQuoteCard />
        </div>
      </section>

      <WaveDivider />

      <section id="how" className="bg-sahar px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl text-kul">{t("howTitle")}</h2>
          <div className="mt-12 grid gap-10 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.title} className="relative pl-1">
                <div className="mb-4 h-px w-10 bg-barg" />
                <h3 className="font-display text-xl text-kul">{step.title}</h3>
                <p className="mt-2 text-kul/70">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-sahar-dim px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl text-kul">{t("rolesTitle")}</h2>
          <div className="mt-10 grid gap-6 md:grid-cols-2">
            <div className="rounded-wave border border-kul/10 bg-white/70 p-8">
              <h3 className="font-display text-2xl text-kul">
                {t("roleSpeakerTitle")}
              </h3>
              <p className="mt-3 text-kul/70">{t("roleSpeakerBody")}</p>
            </div>
            <div className="rounded-wave border border-barg/20 bg-barg/5 p-8">
              <h3 className="font-display text-2xl text-kul">
                {t("roleListenerTitle")}
              </h3>
              <p className="mt-3 text-kul/70">{t("roleListenerBody")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-tun px-6 py-20 text-sahar">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl">{t("safetyTitle")}</h2>
          <p className="mt-4 text-sahar/70">{t("safetyBody")}</p>
        </div>
      </section>
    </>
  );
}
