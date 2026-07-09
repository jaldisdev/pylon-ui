import clsx from "clsx";
import type {LucideIcon} from "lucide-react";

export interface IconToggleOption<T extends string> {
  key: T;
  icon: LucideIcon;
  label: string;
}

interface IconToggleProps<T extends string> {
  options: IconToggleOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  className?: string;
}

// Segmented icon-button group, e.g. the Query Editor's split-direction toggle.
// Generic over the option key type so callers get type-safe onSelect values.
export const IconToggle = <T extends string>({
  options,
  selected,
  onSelect,
  className,
}: IconToggleProps<T>) => (
  <div className={clsx("flex items-center gap-0.5 rounded-md border border-border p-0.5", className)}>
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        title={option.label}
        onClick={() => onSelect(option.key)}
        className={clsx(
          "flex h-6 w-6 items-center justify-center rounded",
          selected === option.key
            ? "bg-surface-hover text-accent"
            : "text-fg-muted hover:text-fg"
        )}
      >
        <option.icon size={14} strokeWidth={1.75} />
      </button>
    ))}
  </div>
);
