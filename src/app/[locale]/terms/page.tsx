import { getTranslations, setRequestLocale } from "next-intl/server";

const SECTION_COUNT = 6;

export default async function TermsPage({
  params: { locale },
}: {
  params: { locale: string };
}) {
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "terms" });

  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => ({
    title: t(`section${i + 1}Title`),
    body: t(`section${i + 1}Body`),
  }));

  return (
    <section className="bg-sahar px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-kul">{t("pageTitle")}</h1>
        <p className="mt-4 text-kul/70">{t("intro")}</p>

        <div className="mt-10 space-y-8">
          {sections.map((section) => (
            <div key={section.title}>
              <h2 className="font-display text-xl text-kul">
                {section.title}
              </h2>
              <p className="mt-2 leading-relaxed text-kul/70">
                {section.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
