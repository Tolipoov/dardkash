import type { MetadataRoute } from "next";
import { defaultLocale, locales } from "@/i18n/config";
import { SITE_URL } from "@/lib/site";

const PUBLIC_PATHS = ["", "/terms", "/privacy"];

// localePrefix "as-needed": asosiy til prefikssiz, qolganlari prefiks bilan.
function urlFor(locale: string, path: string): string {
  const prefix = locale === defaultLocale ? "" : `/${locale}`;
  return `${SITE_URL}${prefix}${path}` || SITE_URL;
}

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) =>
    locales.map((locale) => ({
      url: urlFor(locale, path),
      changeFrequency: "monthly" as const,
      priority: path === "" ? 1 : 0.3,
      alternates: {
        languages: Object.fromEntries(locales.map((l) => [l, urlFor(l, path)])),
      },
    })),
  );
}
