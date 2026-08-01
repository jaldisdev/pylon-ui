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
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {Check, ChevronsUpDown, Database} from "lucide-react";
import {useLocation, useNavigate, useParams} from "react-router-dom";

import {useConnections} from "@/lib/api/useConnections";

// Connection ("branch") switcher — lists every configured connection and
// navigates to the same tab under the newly selected one.
export const ConnectionMenu: React.FC = () => {
  const {branch} = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const {data} = useConnections();
  const connections = data?.connections ?? (branch ? [branch] : []);

  const selectConnection = (name: string) => {
    if (name === branch) return;
    const rest = location.pathname.split("/").slice(2).join("/");
    navigate(`/${name}/${rest}`);
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium text-fg hover:bg-surface-hover"
        >
          <Database size={14} strokeWidth={1.75} className="text-fg-muted" />
          {branch}
          <ChevronsUpDown size={12} strokeWidth={1.75} className="text-fg-muted" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={6}
          className="z-50 min-w-36 rounded-md border border-border bg-surface p-1 shadow-(--shadow-card)"
        >
          {connections.map((name) => (
            <DropdownMenu.Item
              key={name}
              onSelect={() => selectConnection(name)}
              className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-fg outline-none data-[highlighted]:bg-surface-hover"
            >
              <Check size={12} strokeWidth={2} className={name === branch ? "text-accent" : "text-transparent"} />
              {name}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
