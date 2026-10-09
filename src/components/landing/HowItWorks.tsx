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
      <h2 className="mb-10 font-display text-[28px] leading-tight text-kul md:mb-14 md:text-[40px]">{t("howTitle")}</h2>
      <div className="grid gap-8 md:grid-cols-3 md:gap-12">
        {steps.map((step, i) => (
          <div key={step.title} className="grid grid-cols-[48px_1fr] items-start gap-4 md:flex md:flex-col md:gap-[18px]">
            <span className="grid size-12 place-items-center rounded-full bg-sahar font-display text-xl text-barg md:size-16 md:text-[26px]">
              {i + 1}
            </span>
            <div className="flex flex-col gap-2 md:gap-[18px]">
              <h3 className="font-display text-xl text-kul md:text-2xl">{step.title}</h3>
              <p className="text-base text-kul/60">{step.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
