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
import { Link, useParams } from "react-router-dom";
import { Card } from "@/ui/Card";
import { Database, Sparkles, SquarePen, Table2, Terminal } from "lucide-react";
import { useStats } from "@/lib/api/useStats";

// Action buttons
const actions = [
  { path: "repl", Icon: Terminal, label: "Open REPL" },
  { path: "query", Icon: SquarePen, label: "Open Editor" },
  { path: "data", Icon: Table2, label: "Data Viewer" },
  { path: "ai", Icon: Sparkles, label: "AI Test" },
];

export const DashboardTab: React.FC = () => {
  const { branch } = useParams();
  const { data } = useStats();

  // Statistics
  const stats = [
    { value: data?.objects ?? "—", label: "objects" },
    { value: data?.types ?? "—", label: "object types" },
  ];

  // Output
  return (
    <Card className="flex-1 justify-between">
      <div className="w-full max-w-4xl mx-auto bg-yellow">

        <div className="flex items-center justify-center gap-x-2.5 py-14">
          <Database size={30} strokeWidth={2.25} />
          <span className="font-mono font-[650] text-2xl">{branch}</span>
        </div>

        {/* 3. Mapped over the actions array to dry up the Link HTML/classes */}
        <div className="grid md:grid-cols-4 px-4 md:px-8 pb-8">
          {actions.map(({ path, Icon, label }) => (
            <Link
              key={path}
              to={`/${branch}/${path}`}
              className="flex items-center justify-center gap-x-3 h-20 m-2 px-2.5 rounded-lg bg-emerald-500 dark:bg-emerald-700 text-white"
            >
              <Icon size={20} strokeWidth={1.75} />
              <span className="inline-block px-1.5 font-[550] text-base tracking-wider">
                {label}
              </span>
            </Link>
          ))}
        </div>

        {/* 4. Mapped over the stats array */}
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-22 mt-5 mx-14">
          {stats.map(({ value, label }) => (
            <div key={label} className="flex flex-col items-center p-7.5">
              <div className="font-[650] text-4xl leading-12">{value}</div>
              <div className="font-mono font-[450] text-base leading-6 opacity-50">
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 px-3 py-2 bg-surface text-xs text-fg-muted text-center select-none">
        Pylon {APP_VERSION}
      </div>
    </Card>
  );
};
