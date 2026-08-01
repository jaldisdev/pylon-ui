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

// Bottom tab bar shown instead of the sidebar on narrow viewports.
export const MobileNav: React.FC = () => (
  <nav className="flex shrink-0 items-center justify-around border-t border-border bg-surface py-1.5">
    {tabs.map((tab) => (
      <NavLink
        key={tab.path}
        to={tab.path}
        end={tab.path === ""}
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
