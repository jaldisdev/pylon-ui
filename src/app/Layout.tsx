import type React from "react";
import {Outlet, useParams} from "react-router-dom";

import {useConnections} from "@/lib/api/useConnections";
import {useSchema} from "@/lib/api/useSchema";
import {useIsMobile} from "@/lib/hooks/useIsMobile";
import {Card} from "@/ui/Card";
import {GlobalsBar} from "@/ui/layout/GlobalsBar";
import {MobileNav} from "@/ui/layout/MobileNav";
import {Sidebar} from "@/ui/layout/Sidebar";
import {TopBar} from "@/ui/layout/TopBar";
import {NotFound} from "@/ui/NotFound";

// App shell: top bar + globals pill bar, then a sidebar (desktop) or bottom
// nav (mobile) alongside the active tab's content.
export const Layout: React.FC = () => {
  const isMobile = useIsMobile();
  const {branch} = useParams();
  // Fetched once here so it's warm in the TanStack Query cache by the time
  // any tab (JsonTree, future Data Explorer) needs it — same "load schema on
  // connect" idea as Gel's UI.
  useSchema();
  const {data: connections} = useConnections();

  // Renders 404 once the connections list has loaded and :branch isn't
  // "main" or a configured [database.<name>] — rendering optimistically
  // (as valid) until then avoids a loading-state flash on every navigation.
  const isUnknownConnection = !!connections && !!branch && !connections.connections.includes(branch);

  // Output — Sidebar spans the full height directly below TopBar; GlobalsBar
  // sits in the content column so it's indented to the same level as `main`,
  // matching Gel's layout (not full-bleed above the sidebar).
  return (
    <div className="flex h-dvh flex-col bg-bg text-fg">
      <TopBar />
      <div className="flex min-h-0 flex-1">
        {!isMobile && <Sidebar />}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <GlobalsBar />
          <main className="flex min-h-0 min-w-0 flex-1 md:pr-2 md:pb-2">
            {isUnknownConnection ? (
              <Card>
                <NotFound label={`No connection named "${branch}"`} />
              </Card>
            ) : (
              <Outlet />
            )}
          </main>
        </div>
      </div>
      {isMobile && <MobileNav />}
    </div>
  );
};
