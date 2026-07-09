import type React from "react";
import clsx from "clsx";

interface TooltipProps {
  label: string;
  side?: "top" | "bottom" | "left" | "right";
  // For top/bottom: whether the tooltip centers on the trigger or hugs one
  // edge of it — "end" avoids overflowing offscreen when the trigger sits
  // flush against that edge (e.g. the top bar's rightmost button).
  align?: "center" | "end";
  children: React.ReactNode;
}

const SIDE_CLASSES: Record<NonNullable<TooltipProps["side"]>, Record<NonNullable<TooltipProps["align"]>, string>> = {
  top: {center: "bottom-full left-1/2 mb-1.5 -translate-x-1/2", end: "bottom-full right-0 mb-1.5"},
  bottom: {center: "top-full left-1/2 mt-1.5 -translate-x-1/2", end: "top-full right-0 mt-1.5"},
  left: {center: "right-full top-1/2 mr-1.5 -translate-y-1/2", end: "right-full top-1/2 mr-1.5 -translate-y-1/2"},
  right: {center: "left-full top-1/2 ml-1.5 -translate-y-1/2", end: "left-full top-1/2 ml-1.5 -translate-y-1/2"},
};

// Hover-triggered label (CSS-only, no positioning library) — colors are
// inverted vs. the page theme so it reads clearly in both light and dark
// mode, matching gel-ui's sidebar/icon tooltips.
export const Tooltip: React.FC<TooltipProps> = ({label, side = "bottom", align = "center", children}) => (
  <span className="group/tooltip relative inline-flex">
    {children}
    <span
      className={clsx(
        "pointer-events-none absolute z-50 rounded-md bg-tooltip px-2 py-1 text-xs font-medium whitespace-nowrap text-tooltip-fg opacity-0 transition-opacity delay-300 group-hover/tooltip:opacity-100",
        SIDE_CLASSES[side][align]
      )}
    >
      {label}
    </span>
  </span>
);
