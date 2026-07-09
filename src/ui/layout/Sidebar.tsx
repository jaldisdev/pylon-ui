import type React from "react";
import clsx from "clsx";
import {NavLink} from "react-router-dom";

import {tabs} from "@/app/tabs";

// Desktop vertical icon nav, one entry per tab. Hidden on mobile in favor of
// MobileNav (see useIsMobile in Layout.tsx).
export const Sidebar: React.FC = () => (
  <nav className="flex w-14 shrink-0 flex-col items-center gap-1 py-3">
    {tabs.map((tab) => (
      <NavLink
        key={tab.path}
        to={tab.path}
        className={({isActive}) =>
          clsx(
            "flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
            isActive && "bg-surface-active text-accent"
          )
        }
        title={tab.label}
      >
        <tab.icon size={20} strokeWidth={1.75} />
      </NavLink>
    ))}
  </nav>
);
