import type React from "react";
import {Outlet} from "react-router-dom";

import {useSchema} from "@/lib/api/useSchema";
import {useIsMobile} from "@/lib/hooks/useIsMobile";
import {GlobalsBar} from "@/ui/layout/GlobalsBar";
import {MobileNav} from "@/ui/layout/MobileNav";
import {Sidebar} from "@/ui/layout/Sidebar";
import {TopBar} from "@/ui/layout/TopBar";

// App shell: top bar + globals pill bar, then a sidebar (desktop) or bottom
// nav (mobile) alongside the active tab's content.
export const Layout: React.FC = () => {
  const isMobile = useIsMobile();
  // Fetched once here so it's warm in the TanStack Query cache by the time
  // any tab (JsonTree, future Data Explorer) needs it — same "load schema on
  // connect" idea as Gel's UI.
  useSchema();

  // Output
  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <GlobalsBar />
      <div className="flex min-h-0 flex-1">
        {!isMobile && <Sidebar />}
        <main className="min-w-0 flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
      {isMobile && <MobileNav />}
    </div>
  );
};
