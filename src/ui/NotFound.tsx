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
import {Link} from "react-router-dom";

interface NotFoundProps {
  label: string;
}

// Shown in place of a tab's content when the URL's :branch segment doesn't
// match "main" or any configured [database.<name>] connection.
export const NotFound: React.FC<NotFoundProps> = ({label}) => (
  <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-fg-muted">
    <span className="font-medium text-fg">404 — Not Found</span>
    <span>{label}</span>
    <Link to="/main/repl" className="text-accent hover:underline">
      Go to main
    </Link>
  </div>
);
