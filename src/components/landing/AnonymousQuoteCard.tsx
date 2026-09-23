"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

const QUOTE_COUNT = 3;
const ROTATE_MS = 6000;

export default function AnonymousQuoteCard() {
  const t = useTranslations("landing");
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setIndex((i) => (i + 1) % QUOTE_COUNT);
        setVisible(true);
      }, 300);
    }, ROTATE_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-kul/10 bg-sahar p-8 shadow-[0_24px_60px_-20px_rgba(42,41,36,0.35)]">
      <span
        className="font-display text-6xl leading-none text-yulduz"
        aria-hidden="true"
      >
        &ldquo;
      </span>

      <p
        className={`mt-2 min-h-[7.5rem] font-display text-xl leading-relaxed text-kul transition-opacity duration-300 ${
          visible ? "opacity-100" : "opacity-0"
        }`}
      >
        {t(`quote${index + 1}`)}
      </p>

      <div className="mt-7 flex items-center gap-2.5 border-t border-kul/10 pt-5">
        <span className="h-2 w-2 rounded-full bg-barg animate-pulseSoft" />
        <span className="text-sm text-kul/55">{t("quoteAttribution")}</span>
      </div>
    </div>
  );
}
