// Ported from gel-ui's shared/studio/components/explainVis/state.ts
// (ExplainState + Plan + walkPlanNode) — the mobx-keystone observable model
// is replaced with a plain React hook holding the same fields/actions
// (pylon-ui has no mobx dependency; this is a framework substitution, not a
// feature cut), and everything to do with `contexts`/`buffers`/`ctxId`
// (Gel's per-node *source-text span* data, used to highlight the query text
// a plan node came from) is dropped because pylon-core's `analyze` doesn't
// produce that: it only tracks a `marker_offset` — one byte position per
// shape path, not the full span-range data Gel's `ContextDesc` carries (see
// pylon-core's own `analyze` design notes for why). Every `Plan.contextId`
// here is always `null`.
//
// One behavioral consequence of that: gel-ui's `FlamegraphNode`/
// `TreemapNode` skip a subplan sharing the *same* `contextId` as its parent
// (`if (subplan.contextId === ctxId) continue`) — a heuristic for "this
// child's IR got folded into the parent's own node, don't double-render
// it." With `contextId` always `null` here, that specific comparison would
// spuriously match on *every* subplan (`null === null`) and hide all of
// them — so that one check is omitted in this port rather than translated
// literally; every subplan the backend sends is rendered.

import {useCallback, useMemo, useRef, useState} from "react";

import type {CoarseGrainedNode} from "@/lib/api/client";
import {useLocalStorageState} from "@/lib/hooks/useLocalStorageState";

export interface Plan {
  id: string;
  parent: Plan | null;
  childDepth: number;
  name: string | null;
  totalTime: number | null;
  totalCost: number;
  selfTime: number | null;
  selfCost: number;
  selfTimePercent: number | null;
  selfCostPercent: number;
  subPlans: Plan[];
  // Always null — see this file's own top comment.
  contextId: null;
  raw: CoarseGrainedNode;
}

// `data.path` is a stable, deterministic, unique-per-node string (unlike
// Gel's own `plan_id`, a random uuid assigned per Postgres plan node) — used
// directly as `Plan.id` instead of generating one.
export function walkPlanNode(
  data: CoarseGrainedNode,
  queryTotalTime: number | null,
  queryTotalCost: number,
  planName: string | null = null
): Plan {
  const subPlans: Plan[] = data.children.map((child) => walkPlanNode(child.node, queryTotalTime, queryTotalCost, child.name));

  const totalTime = data.cost.actual_total_time !== null ? data.cost.actual_total_time * (data.cost.actual_loops ?? 1) : null;
  const totalCost = data.cost.total_cost;

  const selfTime =
    totalTime !== null ? Math.max(0, totalTime - subPlans.reduce((sum, plan) => sum + (plan.totalTime ?? 0), 0)) : null;
  const selfCost = Math.max(0, totalCost - subPlans.reduce((sum, plan) => sum + plan.totalCost, 0));

  const selfTimePercent = selfTime !== null && queryTotalTime ? selfTime / queryTotalTime : null;
  const selfCostPercent = selfCost / queryTotalCost;

  const plan: Plan = {
    id: data.path,
    parent: null,
    childDepth: subPlans.length ? Math.max(...subPlans.map((subplan) => subplan.childDepth)) + 1 : 0,
    name: planName,
    totalTime,
    totalCost,
    selfTime,
    selfCost,
    selfTimePercent,
    selfCostPercent,
    contextId: null,
    subPlans,
    raw: data,
  };

  for (const subplan of subPlans) {
    subplan.parent = plan;
  }

  return plan;
}

export enum GraphType {
  area = "area",
  flame = "flame",
}

export enum GraphUnit {
  time = "time",
  cost = "cost",
}

export interface TreemapTransition {
  kind: "in" | "out";
  from: Plan;
  pos?: {top: number; left: number; width: number; height: number};
}

// Mirrors ExplainState's public surface (fields + actions) as a plain hook.
export function useAnalyzeState(root: CoarseGrainedNode) {
  const planTree = useMemo(() => {
    const totalTime = root.cost.actual_total_time !== null ? root.cost.actual_total_time * (root.cost.actual_loops ?? 1) : null;
    return walkPlanNode(root, totalTime, root.cost.total_cost);
  }, [root]);

  // Persisted like gel-ui's own `explainGraphSettings` (a module-level
  // singleton + localStorage) — scoped per pylon-ui's existing
  // useLocalStorageState convention instead of a separate global store.
  const [graphType, setGraphType] = useLocalStorageState<GraphType>("pylon-ui-analyze-graph-type", GraphType.area);
  const [graphUnit, setGraphUnit] = useLocalStorageState<GraphUnit>("pylon-ui-analyze-graph-unit", GraphUnit.time);

  const isAreaGraph = graphType === GraphType.area;
  const isTimeGraph = planTree.totalTime !== null && graphUnit === GraphUnit.time;

  const maxFlamegraphZoom = Math.max(1, isTimeGraph ? planTree.totalTime! * 10 : planTree.totalCost);

  const [flamegraphZoomOffset, setFlamegraphZoomOffset] = useState<[number, number]>([1, 0]);
  const [flamegraphWidth, setFlamegraphWidthState] = useState(0);

  const setFlamegraphZoom = useCallback(
    (newZoomRaw: number, center = 0) => {
      const newZoom = Math.min(Math.max(1, newZoomRaw), maxFlamegraphZoom);
      setFlamegraphZoomOffset(([zoom, offset]) => {
        const oldCenterPercent = (center + offset) / (zoom * flamegraphWidth);
        const newTotalOffset = newZoom * flamegraphWidth * oldCenterPercent;
        const newOffset = Math.min(Math.max(0, newTotalOffset - center), (newZoom - 1) * flamegraphWidth);
        return [newZoom, newOffset];
      });
    },
    [maxFlamegraphZoom, flamegraphWidth]
  );

  const setFlamegraphOffset = useCallback(
    (offset: number) => {
      setFlamegraphZoomOffset(([zoom]) => [zoom, Math.min(Math.max(0, offset), (zoom - 1) * flamegraphWidth)]);
    },
    [flamegraphWidth]
  );

  const setFlamegraphWidth = useCallback((width: number) => {
    setFlamegraphWidthState((oldWidth) => {
      if (oldWidth) {
        setFlamegraphZoomOffset(([zoom, offset]) => [zoom, Math.max(0, offset - (oldWidth - width) * zoom * 0.5)]);
      }
      return width;
    });
  }, []);

  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [hoveredPlan, setHoveredPlan] = useState<Plan | null>(null);
  const [focusedPlan, setFocusedPlan] = useState<Plan | null>(null);
  const treemapContainerRef = useRef<HTMLDivElement | null>(null);
  const [treemapTransition, setTreemapTransition] = useState<TreemapTransition | null>(null);

  const treemapZoomIn = useCallback(
    (toPlan: Plan, el: HTMLDivElement) => {
      setFocusedPlan((current) => {
        if (toPlan === current) return current;
        const contRect = treemapContainerRef.current!.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        setTreemapTransition({
          kind: "in",
          from: current ?? planTree,
          pos: {
            top: (rect.top - contRect.top - 2) / contRect.height,
            left: (rect.left - contRect.left - 2) / contRect.width,
            width: (rect.width + 4) / contRect.width,
            height: (rect.height + 4) / contRect.height,
          },
        });
        return toPlan;
      });
    },
    [planTree]
  );

  const treemapZoomOut = useCallback((toPlan: Plan | null) => {
    setFocusedPlan((current) => {
      if (toPlan === current) return current;
      setTreemapTransition({kind: "out", from: current!});
      return toPlan;
    });
  }, []);

  const updateTreemapTransitionPos = useCallback((el: HTMLDivElement) => {
    const contRect = treemapContainerRef.current!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    setTreemapTransition((current) => ({
      ...current!,
      pos: {
        top: (rect.top - contRect.top - 2) / contRect.height,
        left: (rect.left - contRect.left - 2) / contRect.width,
        width: (rect.width + 4) / contRect.width,
        height: (rect.height + 4) / contRect.height,
      },
    }));
  }, []);

  const finishTreemapTransition = useCallback(() => setTreemapTransition(null), []);

  return {
    planTree,
    graphType,
    setGraphType,
    isAreaGraph,
    graphUnit,
    setGraphUnit,
    isTimeGraph,
    maxFlamegraphZoom,
    flamegraphZoomOffset,
    setFlamegraphZoom,
    setFlamegraphOffset,
    flamegraphWidth,
    setFlamegraphWidth,
    selectedPlan,
    setSelectedPlan,
    hoveredPlan,
    setHoveredPlan,
    focusedPlan,
    treemapContainerRef,
    treemapTransition,
    treemapZoomIn,
    treemapZoomOut,
    updateTreemapTransitionPos,
    finishTreemapTransition,
  };
}

export type AnalyzeState = ReturnType<typeof useAnalyzeState>;
