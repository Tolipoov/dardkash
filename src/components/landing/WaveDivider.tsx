export default function WaveDivider({ flip = false }: { flip?: boolean }) {
  return (
    <svg
      viewBox="0 0 1200 60"
      preserveAspectRatio="none"
      className={`wave-divider h-10 w-full ${flip ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path
        d="M0,30 C150,60 350,0 600,30 C850,60 1050,0 1200,30 L1200,60 L0,60 Z"
        fill="#EDEAE2"
      />
    </svg>
  );
}
