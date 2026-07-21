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
