import { getTranslations } from "next-intl/server";

export default async function HowItWorks() {
  const t = await getTranslations("landing");
  const steps = [
    { title: t("step1Title"), body: t("step1Body") },
    { title: t("step2Title"), body: t("step2Body") },
    { title: t("step3Title"), body: t("step3Body") },
  ];

  return (
    <div id="how">
      <h2 className="mb-14 font-display text-[40px] text-kul">{t("howTitle")}</h2>
      <div className="grid gap-12 md:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.title} className="flex flex-col gap-[18px]">
            <span className="grid size-16 place-items-center rounded-full bg-sahar font-display text-[26px] text-barg">
              {i + 1}
            </span>
            <h3 className="font-display text-2xl text-kul">{step.title}</h3>
            <p className="text-base text-kul/60">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
