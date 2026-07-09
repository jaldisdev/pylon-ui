import type React from "react";
import {Database, Moon, Sun, SunMoon} from "lucide-react";

import {useConnectionStore} from "@/lib/state/connectionStore";
import {useTheme, type Theme} from "@/lib/theme/useTheme";
import {Tooltip} from "@/ui/Tooltip";

// Cycles through the three theme modes in a fixed order on each click.
const NEXT_THEME: Record<Theme, Theme> = {
  light: "dark",
  dark: "system",
  system: "light",
};

const THEME_ICON: Record<Theme, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: SunMoon,
};

// Top bar: project/branch breadcrumb on the left, theme toggle on the right.
export const TopBar: React.FC = () => {
  const branch = useConnectionStore((s) => s.branch);
  const {theme, setTheme} = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  // Output
  return (
    <header className="flex h-11 shrink-0 items-center justify-between px-3">
      <div className="flex items-center gap-1.5 text-sm text-fg">
        <Database size={16} strokeWidth={1.75} className="text-fg-muted" />
        <span className="font-medium">{branch}</span>
      </div>
      <Tooltip label={`Theme: ${theme}`} side="bottom" align="end">
        <button
          type="button"
          onClick={() => setTheme(NEXT_THEME[theme])}
          className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <ThemeIcon size={16} strokeWidth={1.75} />
        </button>
      </Tooltip>
    </header>
  );
};
