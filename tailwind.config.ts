import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // "Tabiiy boshpana" palitrasi — o'simlikka to'la, tabiiy yorug'lik
        // tushgan xona kayfiyati. Nomlar saqlanib qoldi (mox — barg,
        // loy-rang urg'u — yulduz), faqat qiymatlar yangilandi.
        tun: "#1E1B15",
        "tun-deep": "#131110",
        sahar: "#EDEAE2",
        "sahar-dim": "#E4DED0",
        yulduz: "#B4693F",
        "yulduz-dim": "#8F5233",
        // Yulduz-100 blok (rol kartasi, "tinglovchi bo'lmoqchimisiz") uchun
        // yorug' fon + unga mos matn ranglari — asosiy "yulduz" ranggacha
        // tint/shade qilingan, palitradan tashqariga chiqmasdan.
        "yulduz-100": "#F2E3D6",
        "yulduz-ink": "#5C3620",
        "yulduz-ink-2": "#79462B",
        barg: "#5F7D5A",
        "barg-dim": "#4C6548",
        // Barg-100 blok (rol kartasi, xavfsizlik bloki) uchun xuddi shunday.
        "barg-100": "#E3E9DD",
        "barg-ink": "#26331F",
        "barg-ink-2": "#3A4A32",
        kul: "#2A2924",
        gisht: "#A6503D",
      },
      fontFamily: {
        display: ["var(--font-fraunces)", "Georgia", "serif"],
        sans: ["var(--font-manrope)", "system-ui", "sans-serif"],
      },
      spacing: {
        18: "4.5rem",
        26: "6.5rem",
        30: "7.5rem",
        35: "8.75rem",
      },
      borderRadius: {
        wave: "2rem 0.5rem 2rem 0.5rem",
      },
      keyframes: {
        pulseSoft: {
          "0%, 100%": { opacity: "0.55" },
          "50%": { opacity: "1" },
        },
        toastIn: {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        pulseSoft: "pulseSoft 2.4s ease-in-out infinite",
        "toast-in": "toastIn 0.25s ease-out",
      },
    },
  },
  plugins: [],
};
export default config;
