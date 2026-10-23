"use client";

import { useTranslations } from "next-intl";

// Ro'yxatlar ostidagi "Yana ko'rsatish" (kabinet, xabarlar, xatlar).
export default function ShowMoreButton({
  onClick,
  loading = false,
  label,
}: {
  onClick: () => void;
  loading?: boolean;
  label?: string;
}) {
  const t = useTranslations("common");
  return (
    <div className="mt-6 text-center">
      <button
        type="button"
        onClick={onClick}
        disabled={loading}
        className="rounded-full border border-kul/20 bg-white/60 px-5 py-2.5 text-sm font-semibold text-kul transition-colors hover:border-barg/60 hover:text-barg disabled:opacity-60"
      >
        {loading ? "…" : (label ?? t("showMore"))}
      </button>
    </div>
  );
}
