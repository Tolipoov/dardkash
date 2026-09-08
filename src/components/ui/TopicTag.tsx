import clsx from "clsx";

interface TopicTagProps {
  label: string;
  selected?: boolean;
  onClick?: () => void;
  as?: "button" | "span";
}

export default function TopicTag({ label, selected, onClick, as = "span" }: TopicTagProps) {
  const classes = clsx(
    "inline-flex items-center rounded-full border px-4 py-1.5 text-sm font-sans transition-colors",
    selected
      ? "bg-barg text-sahar border-barg"
      : "bg-transparent text-kul border-kul/25 hover:border-barg/60"
  );

  if (as === "button") {
    return (
      <button type="button" onClick={onClick} className={classes} aria-pressed={selected}>
        {label}
      </button>
    );
  }
  return <span className={classes}>{label}</span>;
}
