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

// ASCII logo + REPL banner/help text — the logo is pylon's own CLI banner
// (pylon/cli/banner.py's _LOGO_LINES), reused verbatim since Pylon already
// has its own mark.
export const LOGO_LINES = [
  "  ██████╗  ██╗   ██╗██╗      ██████╗ ███╗  ██╗",
  "  ██╔══██╗ ╚██╗ ██╔╝██║     ██╔═══██╗████╗ ██║",
  "  ██████╔╝  ╚████╔╝ ██║     ██║   ██║██╔██╗██║",
  " ██╔═══╝    ╚██╔╝  ██║     ██║   ██║██║╚████║",
  " ██║         ██║   ███████╗╚██████╔╝██║ ╚███║",
  " ╚═╝         ╚═╝   ╚══════╝ ╚═════╝ ╚═╝  ╚══╝",
].join("\n");

export const isMac = () => /Mac|iPod|iPhone|iPad/.test(navigator.platform ?? navigator.userAgent);

export const modKey = () => (isMac() ? "Cmd" : "Ctrl");

export const HELP_TEXT = `Type PyQL statements and press ${modKey()}+Enter to execute them.

  \\help    show this help
  \\clear   clear the history`;
