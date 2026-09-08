import { HTMLAttributes } from "react";
import clsx from "clsx";

export default function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={clsx(
        "rounded-[1.75rem] border border-kul/10 bg-white/60 backdrop-blur-sm p-6",
        className
      )}
      {...props}
    />
  );
}
