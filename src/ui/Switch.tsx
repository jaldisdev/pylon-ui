import type React from "react";
import {Switch as RadixSwitch} from "radix-ui";
import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
}

// Small on/off toggle (per-global activation) — a thin styled wrapper
// around radix-ui's Switch primitive, matching the app's accent color.
export const Switch: React.FC<SwitchProps> = ({checked, onCheckedChange, title, disabled}) => (
  <RadixSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    title={title}
    disabled={disabled}
    className={clsx(
      "relative h-4 w-7 shrink-0 rounded-full outline-none transition-colors duration-200",
      checked ? "bg-accent" : "bg-surface-active",
      disabled && "opacity-50"
    )}
  >
    <RadixSwitch.Thumb
      className={clsx(
        "block h-3 w-3 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 will-change-transform",
        checked && "translate-x-3.5"
      )}
    />
  </RadixSwitch.Root>
);
