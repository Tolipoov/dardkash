import { AVATARS } from "@/lib/avatars";
import {
  Bird,
  Cloud,
  Feather,
  Flower2,
  Leaf,
  Moon,
  Mountain,
  Sprout,
  Star,
  Sun,
  TreePine,
  Waves,
  type LucideIcon,
} from "lucide-react";

const ICONS: Record<string, LucideIcon> = {
  tree: TreePine,
  leaf: Leaf,
  sprout: Sprout,
  flower: Flower2,
  sun: Sun,
  moon: Moon,
  star: Star,
  cloud: Cloud,
  mountain: Mountain,
  waves: Waves,
  bird: Bird,
  feather: Feather,
};

// Tayyor avatar (src/lib/avatars.ts); tanlanmagan bo'lsa — taxallusning
// bosh harfi (avvalgi ko'rinish). `size` — px.
export default function Avatar({
  code,
  nickname,
  size = 40,
  className = "",
}: {
  code?: string | null;
  nickname: string;
  size?: number;
  className?: string;
}) {
  const preset = AVATARS.find((a) => a.code === code);
  const Icon = preset ? ICONS[preset.code] : null;
  return (
    <span
      aria-hidden
      style={{ width: size, height: size }}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${
        preset ? `${preset.bg} ${preset.fg}` : "bg-barg/15 text-barg"
      } ${className}`}
    >
      {Icon ? (
        <Icon size={Math.round(size * 0.52)} strokeWidth={2} />
      ) : (
        <span style={{ fontSize: Math.round(size * 0.42) }}>
          {(nickname || "?").trim().charAt(0).toUpperCase()}
        </span>
      )}
    </span>
  );
}
