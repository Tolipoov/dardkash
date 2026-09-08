import clsx from "clsx";
import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-barg text-sahar hover:bg-barg-dim active:bg-barg-dim shadow-[0_6px_0_0_rgba(42,41,36,0.14)]",
  secondary:
    "bg-transparent text-kul border border-kul/25 hover:border-barg/60 hover:text-barg",
  ghost: "bg-transparent text-kul hover:bg-kul/5",
  danger: "bg-gisht text-sahar hover:bg-gisht/90",
};

const sizeClasses: Record<Size, string> = {
  md: "px-4 py-2.5 text-sm",
  lg: "px-4 py-2.5 text-sm md:px-4 md:py-2.5 md:text-base",
};

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={clsx(
          "inline-flex items-center justify-center gap-2 rounded-full font-sans font-semibold",
          "transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export default Button;
