import { Link } from "@/i18n/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

const SECTION_COUNT = 6;

// Dardkashlar uchun "qanday yaxshi tinglash" qo'llanmasi — onboarding'ning
// dardkash qadamidan va kabinetdagi "Sizning hissangiz" kartasidan ochiladi.
export default async function GuidePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "guide" });

  const sections = Array.from({ length: SECTION_COUNT }, (_, i) => ({
    title: t(`section${i + 1}Title`),
    body: t(`section${i + 1}Body`),
  }));

  return (
    <section className="bg-sahar px-6 py-16">
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-3xl text-kul">{t("pageTitle")}</h1>
        <p className="mt-4 text-lg leading-relaxed text-kul/70">{t("intro")}</p>

        <ol className="mt-10 space-y-8">
          {sections.map((section, i) => (
            <li key={section.title} className="flex gap-4">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-barg/15 font-semibold text-barg">
                {i + 1}
              </span>
              <div>
                <h2 className="font-display text-xl text-kul">{section.title}</h2>
                <p className="mt-2 leading-relaxed text-kul/70">{section.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <Link
          href="/dashboard"
          className="mt-12 inline-block text-sm font-semibold text-barg hover:underline"
        >
          ← {t("backToDashboard")}
        </Link>
      </div>
    </section>
  );
}
