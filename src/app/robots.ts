import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

// Shaxsiy sahifalar (kabinet, suhbat, moderatsiya) qidiruv tizimlariga
// kerak emas — ular baribir login talab qiladi.
const PRIVATE_PATHS = ["/api/", "/dashboard", "/session/", "/admin/", "/onboarding", "/auth"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [...PRIVATE_PATHS, ...PRIVATE_PATHS.map((p) => `/ru${p}`)],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
