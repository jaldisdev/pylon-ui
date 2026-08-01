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

// Ported from @edgedb/common/hooks/useResize — used identically by both
// AnalyzeTreemap.tsx and AnalyzeFlamegraph.tsx (gel-ui's own Treemap and
// Flamegraph components both call the same shared hook).

import {useEffect} from "react";
import type React from "react";

export function useAnalyzeResize(
  ref: React.RefObject<HTMLElement | null>,
  callback: (size: {width: number; height: number}) => void,
  deps: unknown[]
) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const {width, height} = entries[0].contentRect;
      callback({width, height});
    });
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
