export default function VoiceWaveVisual() {
  // Ikki ovoz to'lqini bir-biriga yaqinlashib, uchrashadigan nuqtada
  // "eshitilish" hissini ramziy ifodalaydi. Statik SVG, sahifa yuklanganda
  // bitta yumshoq fade-in bilan chiqadi (motion faqat shu yerda, boshqa hech qayerda).
  return (
    <svg
      viewBox="0 0 480 480"
      className="w-full max-w-md mx-auto"
      role="img"
      aria-label="Ikki ovoz to'lqini bir-birini topmoqda"
    >
      <defs>
        <linearGradient id="waveClayGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#B4693F" />
          <stop offset="100%" stopColor="#8F5233" />
        </linearGradient>
      </defs>
      <circle cx="240" cy="240" r="220" fill="#F5F2E9" />
      <circle cx="240" cy="240" r="220" fill="none" stroke="#2A2924" strokeOpacity="0.08" strokeWidth="1" />

      {/* Chap tomon — dardini aytuvchi ovozi (keng, notekis) */}
      <g opacity="0.9">
        <path
          d="M 90 240 Q 110 170 130 240 T 170 240 T 210 240"
          fill="none"
          stroke="#2A2924"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.55"
        />
        <path
          d="M 90 240 Q 110 200 130 240 T 170 240 T 210 240"
          fill="none"
          stroke="#2A2924"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.3"
        />
      </g>

      {/* O'ng tomon — dardkash ovozi (tinch, tekis) */}
      <g opacity="0.9">
        <path
          d="M 270 240 Q 290 225 310 240 T 350 240 T 390 240"
          fill="none"
          stroke="url(#waveClayGrad)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        <path
          d="M 270 240 Q 290 232 310 240 T 350 240 T 390 240"
          fill="none"
          stroke="url(#waveClayGrad)"
          strokeWidth="4"
          strokeLinecap="round"
          opacity="0.5"
        />
      </g>

      {/* Uchrashish nuqtasi */}
      <circle cx="240" cy="240" r="7" fill="#B4693F" className="animate-pulseSoft" />
    </svg>
  );
}
