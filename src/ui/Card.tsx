import type React from "react";
import clsx from "clsx";

interface CardProps {
  children: React.ReactNode;
  className?: string;
}

// Rounded, shadowed content card — every tab's root sits inside one of these.
// Matches gel-ui's shell: chrome (top bar, nav) carries no borders at all,
// separation comes from this card's shadow against the page background
// instead. Full-bleed (no radius) below the md breakpoint, matching mobile.
export const Card: React.FC<CardProps> = ({children, className}) => (
  <div
    className={clsx(
      "flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-none bg-surface shadow-(--shadow-card) md:rounded-xl",
      className
    )}
  >
    {children}
  </div>
);
