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
import clsx from "clsx";
import {NavLink} from "react-router-dom";

import {tabs} from "@/app/tabs";
import {Tooltip} from "@/ui/Tooltip";

// Desktop vertical icon nav, one entry per tab. Hidden on mobile in favor of
// MobileNav (see useIsMobile in Layout.tsx).
export const Sidebar: React.FC = () => (
  <nav className="flex w-14 shrink-0 flex-col items-center gap-1 pb-3">
    {tabs.map((tab) => (
      <Tooltip key={tab.path} label={tab.label} side="right">
        <NavLink
          to={tab.path}
          end={tab.path === ""}
          className={({isActive}) =>
            clsx(
              "flex h-10 w-10 items-center justify-center rounded-lg text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg",
              isActive && "bg-surface-active text-accent"
            )
          }
        >
          <tab.icon size={20} strokeWidth={1.75} />
        </NavLink>
      </Tooltip>
    ))}
  </nav>
);
