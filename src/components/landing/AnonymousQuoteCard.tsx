export default function AnonymousQuoteCard() {
  return (
    <div className="mx-auto max-w-md rounded-[2rem] border border-kul/10 bg-sahar p-8 shadow-[0_24px_60px_-20px_rgba(42,41,36,0.35)]">
      <span
        className="font-display text-6xl leading-none text-yulduz"
        aria-hidden="true"
      >
        “
      </span>

      <p className="mt-2 font-display text-xl leading-relaxed text-kul">
        Hech kimga ayta olmagan gaplarim bor edi. Bu yerda ismimni aytmasdan
        ham meni chin dildan tingladilar.
      </p>

      <div className="mt-7 flex items-center gap-2.5 border-t border-kul/10 pt-5">
        <span className="h-2 w-2 rounded-full bg-barg animate-pulseSoft" />
        <span className="text-sm text-kul/55">
          Anonim foydalanuvchi · shu suhbatda
        </span>
      </div>
    </div>
  );
}
