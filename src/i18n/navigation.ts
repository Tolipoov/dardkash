import { createNavigation } from "next-intl/navigation";
import { locales, defaultLocale } from "./config";

// "as-needed" rejimi: asosiy til (uz) prefikssiz ishlaydi (dardkash.uz),
// qolgan tillar prefiks bilan (dardkash.uz/ru). Link/useRouter/usePathname
// shu sozlamaga mos ravishda avtomatik URL quradi.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation({
    locales,
    defaultLocale,
    localePrefix: "as-needed",
  });
