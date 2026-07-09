import type React from "react";
import {Moon, RadioTower, Sun, SunMoon} from "lucide-react";

import {useConnections} from "@/lib/api/useConnections";
import {useTheme, type Theme} from "@/lib/theme/useTheme";
import {ConnectionMenu} from "@/ui/layout/ConnectionMenu";
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

// Top bar: project name / connection breadcrumb on the left, theme toggle on
// the right — matching Gel's breadcrumb nav (instance / database / ...).
export const TopBar: React.FC = () => {
  const {data: connections} = useConnections();
  const {theme, setTheme} = useTheme();
  const ThemeIcon = THEME_ICON[theme];

  // Output
  return (
    <header className="flex h-11 shrink-0 items-center justify-between px-3">
      <div className="flex items-center gap-1.5 text-sm text-fg">
        <RadioTower size={16} strokeWidth={1.75} className="text-fg-muted" />
        <span className="font-medium">{connections?.project ?? "pylon"}</span>
        <svg width="8" height="17" viewBox="0 0 8 17" fill="none" className="ml-1.5 text-fg-muted">
          <path d="M7.66602 0.78125L1.73828 16.2207H0.185547L6.12305 0.78125H7.66602Z" fill="currentColor" />
        </svg>
        <ConnectionMenu />
      </div>
      <Tooltip label={`Theme: ${theme}`} side="bottom" align="end">
        <button
          type="button"
          onClick={() => setTheme(NEXT_THEME[theme])}
          className="flex items-center justify-center w-8 h-8 rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
        >
          <ThemeIcon size={20} strokeWidth={1.75} />
        </button>
      </Tooltip>
    </header>
  );
};
