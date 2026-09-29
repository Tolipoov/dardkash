// Bosh sahifaning "pill" CTA tugmalari uchun umumiy klasslar. Dashboard/auth
// sahifalaridagi @/components/ui/Button'dan ataylab alohida — bu yerdagi
// o'lcham (17px/18px padding, soyasiz) faqat landing dizayniga tegishli.
const base =
  "inline-flex items-center justify-center rounded-full font-sans font-bold text-[17px] px-8 py-[18px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-barg";

export const ctaPrimary = `${base} bg-barg text-sahar hover:bg-barg-dim active:bg-barg-dim`;
export const ctaOutline = `${base} border border-barg text-barg hover:bg-barg/10 active:bg-barg/20`;
export const ctaOnDark = `${base} bg-sahar text-barg hover:bg-sahar-dim`;
export const ctaOutlineOnDark = `${base} border border-sahar/50 text-sahar hover:bg-sahar/10`;

const small = "text-base px-7 py-4";
export const ctaPrimarySmall = `${ctaPrimary} ${small}`;
export const ctaYulduzOutline = `${base} ${small} border border-yulduz-dim text-yulduz-ink-2 hover:bg-yulduz/10`;
