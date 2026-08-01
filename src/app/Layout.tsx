//
// This source file is part of the Pylon open source project.
//
// Copyright (c) 2026 Jaldis B.V.
//
// Licensed under the MIT OR Apache-2.0 license (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://opensource.org/licenses/MIT
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

import type React from "react";
import {useEffect} from "react";
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
  // any tab (JsonTree, future Data Explorer) needs it — loaded once on
  // connect, not refetched per tab.
  useSchema();
  const {data: connections} = useConnections();

  // Renders 404 once the connections list has loaded and :branch isn't
  // "main" or a configured [database.<name>] — rendering optimistically
  // (as valid) until then avoids a loading-state flash on every navigation.
  const isUnknownConnection = !!connections && !!branch && !connections.connections.includes(branch);

  // Mirrors the project/connection breadcrumb shown in TopBar, so the
  // browser tab/window title identifies which connection is open.
  useEffect(() => {
    document.title = `${connections?.project ?? "pylon"} / ${branch} · Pylon`;
  }, [connections?.project, branch]);

  // Output — Sidebar spans the full height directly below TopBar; GlobalsBar
  // sits in the content column so it's indented to the same level as `main`
  // (not full-bleed above the sidebar).
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
