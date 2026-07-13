import type React from "react";
import {useEffect, useRef, useState} from "react";
import clsx from "clsx";
import {Dock, Moon, Settings, Sun, SunMoon} from "lucide-react";

import Logo from "@/assets/logo.svg?react";
import {useConnections} from "@/lib/api/useConnections";
import {useTheme, type Theme} from "@/lib/theme/useTheme";
import {GlobalsModal} from "@/features/globals/GlobalsModal";
import {ConnectionMenu} from "@/ui/layout/ConnectionMenu";
import {Tooltip} from "@/ui/Tooltip";

const THEME_ORDER: Theme[] = ["light", "dark", "system"];

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
  const [globalsModalOpen, setGlobalsModalOpen] = useState(false);

  // Click (not hover) opens the theme menu — same click-outside-closes
  // pattern as InsertRowButton.tsx's type dropdown, and works on mobile
  // where there's no hover state at all.
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const themeMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!themeMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!themeMenuRef.current?.contains(e.target as Node)) setThemeMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [themeMenuOpen]);

  // Output
  return (
    <header className="flex h-11 shrink-0 items-center mb-2 px-3">
      <div className="flex items-center gap-x-2.5 mr-3 md:mr-6 ml-1">
        <Logo className="mr-1 h-6" />
        <span className="hidden md:block font-[550] text-lg">Pylon</span>
      </div>

      <div className="flex items-center gap-1.5 text-sm text-fg">
        <Dock size={16} strokeWidth={1.75} className="text-fg-muted" />
        <span className="font-medium">{connections?.project ?? "pylon"}</span>
        <svg width="8" height="17" viewBox="0 0 8 17" fill="none" className="ml-1.5 text-fg-muted">
          <path d="M7.66602 0.78125L1.73828 16.2207H0.185547L6.12305 0.78125H7.66602Z" fill="currentColor" />
        </svg>
        <ConnectionMenu />
      </div>
      <div className="flex items-center gap-1 ml-auto">
        <Tooltip label="Session globals" side="bottom" align="end">
          <button
            type="button"
            onClick={() => setGlobalsModalOpen(true)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <Settings size={18} strokeWidth={1.75} />
          </button>
        </Tooltip>
        {/* Fixed-size placeholder reserves this button's normal-flow slot —
            the actual pill below is absolutely positioned within it, so its
            click-triggered expansion never shifts the Settings button (or
            anything else) — it only ever overlays the space to its left,
            matching Gel's own expanding theme switcher. */}
        <div ref={themeMenuRef} className="relative h-8 w-8">
          <div
            className={clsx(
              "absolute inset-y-0 right-0 z-10 flex items-center justify-end rounded-md",
              themeMenuOpen ? "bg-surface-hover" : "hover:bg-surface-hover"
            )}
          >
            {THEME_ORDER.map((t) => {
              const Icon = THEME_ICON[t];
              const isActive = t === theme;
              const expanded = isActive || themeMenuOpen;
              return (
                <Tooltip key={t} label={`Theme: ${t}`} side="bottom" align="end">
                  <button
                    type="button"
                    onClick={() => {
                      if (!themeMenuOpen) {
                        setThemeMenuOpen(true);
                        return;
                      }
                      setTheme(t);
                      setThemeMenuOpen(false);
                    }}
                    className={clsx(
                      "flex h-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-fg-muted transition-[width] duration-200 hover:bg-surface-hover hover:text-fg",
                      expanded ? "w-8" : "w-0"
                    )}
                  >
                    <Icon size={20} strokeWidth={1.75} className="shrink-0" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
      {globalsModalOpen && <GlobalsModal onClose={() => setGlobalsModalOpen(false)} />}
    </header>
  );
};
