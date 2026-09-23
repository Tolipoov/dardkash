import AnonymousQuoteCard from "@/components/landing/AnonymousQuoteCard";
import HeroCTAButtons from "@/components/landing/HeroCTAButtons";
import LandingStats from "@/components/landing/LandingStats";
import WaveDivider from "@/components/landing/WaveDivider";
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

  const safetyPoints = [
    t("safetyPoint1"),
    t("safetyPoint2"),
    t("safetyPoint3"),
  ];

  return (
    <>
      <section
        className="relative overflow-hidden text-kul"
        style={{
          background:
            "radial-gradient(60% 70% at 15% 10%, rgba(255,252,242,0.9) 0%, rgba(255,252,242,0) 55%), " +
            "radial-gradient(55% 60% at 100% 100%, rgba(95,125,90,0.12) 0%, rgba(95,125,90,0) 60%), " +
            "#EDEAE2",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-24 top-10 h-72 w-72 rounded-full bg-barg/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 bottom-0 h-80 w-80 rounded-full bg-yulduz/10 blur-3xl"
        />

        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2 md:py-28">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-barg/25 bg-barg/10 px-4 py-1.5 font-sans text-sm font-semibold text-barg">
              <span className="h-1.5 w-1.5 rounded-full bg-barg" />
              {t("eyebrow")}
            </span>
            <h1 className="mt-6 font-display text-3xl leading-tight md:text-5xl">
              {t("title")}
            </h1>
            <p className="mt-6 max-w-md text-lg text-kul/70">{t("subtitle")}</p>

            <HeroCTAButtons />
            <p className="mt-5 text-sm text-kul/45">{t("trustNote")}</p>
          </div>

          <div className="relative">
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -inset-6 -z-10 rounded-[2.5rem] bg-gradient-to-br from-barg/10 via-transparent to-yulduz/10 blur-2xl"
            />
            <AnonymousQuoteCard />
          </div>
        </div>
      </section>

      <WaveDivider />

      <LandingStats />

      <section id="how" className="bg-sahar px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="font-display text-3xl text-kul">{t("howTitle")}</h2>
          <div className="relative mt-14 grid gap-10 md:grid-cols-3">
            <div
              aria-hidden="true"
              className="absolute left-0 right-0 top-6 hidden h-px bg-[repeating-linear-gradient(to_right,rgba(95,125,90,0.4)_0,rgba(95,125,90,0.4)_8px,transparent_8px,transparent_16px)] md:block"
            />
            {steps.map((step, i) => (
              <div key={step.title} className="relative">
                <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-barg font-display text-lg text-sahar shadow-[0_6px_0_0_rgba(42,41,36,0.14)]">
                  {i + 1}
                </div>
                <h3 className="mt-5 font-display text-xl text-kul">
                  {step.title}
                </h3>
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
            <div className="group rounded-wave border border-kul/10 bg-white/70 p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(42,41,36,0.35)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-kul/5 text-2xl transition-colors group-hover:bg-barg/10">
                💬
              </div>
              <h3 className="mt-5 font-display text-2xl text-kul">
                {t("roleSpeakerTitle")}
              </h3>
              <p className="mt-3 text-kul/70">{t("roleSpeakerBody")}</p>
            </div>
            <div className="group rounded-wave border border-barg/20 bg-barg/5 p-8 transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_-24px_rgba(42,41,36,0.35)]">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-barg/10 text-2xl transition-colors group-hover:bg-barg/20">
                🎧
              </div>
              <h3 className="mt-5 font-display text-2xl text-kul">
                {t("roleListenerTitle")}
              </h3>
              <p className="mt-3 text-kul/70">{t("roleListenerBody")}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-tun px-6 py-20 text-sahar">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl">{t("safetyTitle")}</h2>
            <p className="mt-4 text-sahar/70">{t("safetyBody")}</p>
          </div>
          <ul className="space-y-4">
            {safetyPoints.map((point) => (
              <li key={point} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-barg/20 text-sm text-barg">
                  ✓
                </span>
                <span className="text-sahar/85">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </>
  );
}
