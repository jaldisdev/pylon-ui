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

import {LayoutDashboard, Terminal, SquarePen, Table2, Sparkles, type LucideIcon} from "lucide-react";

// Single source of truth for the app's 4 tabs, shared by the desktop sidebar,
// the mobile bottom nav, and the route table.
export interface TabSpec {
  path: string;
  label: string;
  icon: LucideIcon;
}

export const tabs: TabSpec[] = [
  {path: "", label: "Dashboard", icon: LayoutDashboard},
  {path: "repl", label: "REPL", icon: Terminal},
  {path: "query", label: "Query Editor", icon: SquarePen},
  {path: "data", label: "Data Explorer", icon: Table2},
  {path: "ai", label: "AI", icon: Sparkles},
];
