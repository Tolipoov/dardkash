import { getTranslations } from "next-intl/server";

const QUESTIONS = ["faqQ1", "faqQ2", "faqQ3", "faqQ4", "faqQ5"] as const;
const ANSWERS = ["faqA1", "faqA2", "faqA3", "faqA4", "faqA5"] as const;

export default async function Faq() {
  const t = await getTranslations("landing");

  return (
    <section className="grid gap-18 px-6 pb-26 pt-30 md:grid-cols-[1fr_1.6fr] md:px-18">
      <h2 className="font-display text-[40px] text-kul">{t("faqTitle")}</h2>
      <div className="flex flex-col gap-3">
        {QUESTIONS.map((qKey, i) => (
          <details key={qKey} open={i === 0} className="group rounded-[28px] bg-sahar-dim px-8 py-6">
            <summary className="flex cursor-pointer list-none justify-between gap-4 font-display text-[21px] text-kul [&::-webkit-details-marker]:hidden">
              {t(qKey)}
              <span className="text-barg transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3.5 text-base leading-relaxed text-kul/70">{t(ANSWERS[i])}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
