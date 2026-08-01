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

import {LOGO_LINES, modKey} from "@/features/repl/banner";

// Welcome banner shown once above the scrollback — the Pylon ASCII logo
// (reused from the CLI's own banner) plus welcome/shortcuts copy for our
// own commands (\help/\clear) and hotkeys.
export const ReplHeader: React.FC<{onRunHelp: () => void; onClear: () => void}> = ({onRunHelp, onClear}) => (
  <div className="p-3 text-sm">
    <pre className="font-mono text-[11px] leading-tight whitespace-pre text-accent">{LOGO_LINES}</pre>
    <div className="mt-3 text-fg">
      Welcome to Pylon repl, type{" "}
      <button type="button" onClick={onRunHelp} className="underline hover:text-accent">
        \help
      </button>{" "}
      for commands list
    </div>
    <div className="mt-1 text-fg-muted">
      Shortcuts: <span className="italic">{modKey()}+Enter</span> to run query,{" "}
      <span className="italic">{modKey()}+ArrowUp/Down</span> to navigate history,{" "}
      <button type="button" onClick={onClear} className="underline hover:text-accent">
        \clear
      </button>{" "}
      to clear the history
    </div>
  </div>
);
