import type React from "react";
import clsx from "clsx";
import {NavLink} from "react-router-dom";

import {tabs} from "@/app/tabs";

// Bottom tab bar shown instead of the sidebar on narrow viewports.
export const MobileNav: React.FC = () => (
  <nav className="flex shrink-0 items-center justify-around border-t border-border bg-surface py-1.5">
    {tabs.map((tab) => (
      <NavLink
        key={tab.path}
        to={tab.path}
        className={({isActive}) =>
          clsx(
            "flex flex-col items-center gap-0.5 rounded-lg px-3 py-1.5 text-fg-muted",
            isActive && "text-accent"
          )
        }
      >
        <tab.icon size={20} strokeWidth={1.75} />
        <span className="text-2xs">{tab.label}</span>
      </NavLink>
    ))}
  </nav>
);
