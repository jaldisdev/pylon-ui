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

// Ported from gel-ui's shared/studio/components/explainVis/index.tsx
// (Flamegraph/FlamegraphNode) — same wheel-based zoom (ctrlKey) + pan
// handling, same childWidth/visibleRange virtualization, same hidden-node
// threshold (childWidth>14), same hover/select outline states. The `isLight`
// variant (a small Radix-tooltip preview mode used elsewhere in gel-ui, not
// by its own full Query Editor-equivalent view) is dropped — pylon-ui's
// Query Editor only ever renders the full view. See analyzeState.ts's own
// top comment for why every node's `contextId` is null here, and why the
// `subplan.contextId === ctxId` merge-skip is omitted.

import type React from "react";
import {useRef} from "react";
import clsx from "clsx";

import {useIsMobile} from "@/lib/hooks/useIsMobile";
import {useTheme} from "@/lib/theme/useTheme";
import type {AnalyzeState, Plan} from "@/features/queryEditor/analyzeState";
import {darkPalette, lightPalette} from "@/features/queryEditor/analyzeTreemapLayout";
import {useAnalyzeResize as useResize} from "@/features/queryEditor/useAnalyzeResize";

export const Flamegraph: React.FC<{state: AnalyzeState}> = ({state}) => {
  const ref = useRef<HTMLDivElement>(null);
  useResize(ref, ({width}) => state.setFlamegraphWidth(width - 12), [state]);

  const width = state.flamegraphWidth;
  const [zoom, offset] = state.flamegraphZoomOffset;

  const range = ((state.isTimeGraph && state.planTree.totalTime) || state.planTree.totalCost) / zoom;

  const isTimeGraph = state.isTimeGraph;

  return (
    <div
      style={{height: (state.planTree.childDepth + 1) * 38 + 12}}
      ref={ref}
      className="relative flex-grow overflow-hidden bg-[#f7f7f7] pt-3 mb-0.5 [--outline-color:#468bff] dark:bg-[#242424] dark:[--outline-color:#74a6fc]"
      onWheel={(e) => {
        const [zoom, offset] = state.flamegraphZoomOffset;
        if (e.ctrlKey) {
          const mouseOffset = e.clientX - ref.current!.getBoundingClientRect().left - 8;

          const newZoom = Math.min(Math.max(1, zoom * (1 + e.deltaY / -400)), state.maxFlamegraphZoom);

          state.setFlamegraphZoom(newZoom, mouseOffset);
        } else {
          state.setFlamegraphOffset(offset + e.deltaY);
        }
      }}
    >
      <div className="mx-2 mb-1.5 flex items-center font-['Inter',sans-serif] text-[12px] leading-4 font-medium text-[#666666] dark:text-[#b3b3b3] before:mr-1.5 before:mt-1 before:h-1 before:flex-grow before:border-t-2 before:border-l-2 before:border-[#d9d9d9] before:content-[''] after:ml-1.5 after:mt-1 after:h-1 after:flex-grow after:border-t-2 after:border-r-2 after:border-[#d9d9d9] after:content-[''] dark:before:border-[#666666] dark:after:border-[#666666]">
        <span>{isTimeGraph ? range.toFixed(range < 1 ? 1 : 0) + "ms" : range.toFixed(0)}</span>
      </div>
      <div style={{position: "absolute", left: -offset + 6}} onMouseLeave={() => state.setHoveredPlan(null)}>
        {width ? (
          <FlamegraphNode
            state={state}
            plan={state.planTree}
            depth={0}
            width={width * zoom}
            left={0}
            visibleRange={[offset - 16, offset + width + 16]}
          />
        ) : null}
      </div>
    </div>
  );
};

const FlamegraphNode: React.FC<{
  state: AnalyzeState;
  plan: Plan;
  left: number;
  width: number;
  depth: number;
  visibleRange: [number, number];
}> = ({state, plan, left, width, depth, visibleRange}) => {
  const {resolvedTheme} = useTheme();
  const palette = resolvedTheme === "light" ? lightPalette : darkPalette;

  // Always null — no per-node source-span data (see analyzeState.ts's own top comment).
  const ctxId = plan.contextId;

  const subPlans = plan.subPlans;

  const sortedSubplans: {subplan: Plan; childWidth: number}[] = [];
  let hiddenCount = 0;
  let hiddenWidth = 0;
  for (const subplan of subPlans) {
    const childWidth = (state.isTimeGraph ? subplan.totalTime! / plan.totalTime! : subplan.totalCost / plan.totalCost) * (width - 8);
    if (childWidth > 14) {
      sortedSubplans.push({subplan, childWidth});
    } else {
      hiddenCount++;
      hiddenWidth += childWidth;
    }
  }
  sortedSubplans.sort((a, b) => b.childWidth - a.childWidth);

  let childLeft = 2;
  const childNodes: React.ReactElement[] = [];
  for (const {subplan, childWidth} of sortedSubplans) {
    if (childLeft <= visibleRange[1] && childLeft + childWidth >= visibleRange[0]) {
      childNodes.push(
        <FlamegraphNode
          key={childNodes.length}
          state={state}
          plan={subplan}
          depth={depth + 1}
          width={childWidth}
          left={childLeft}
          visibleRange={[visibleRange[0] - childLeft - 2, visibleRange[1] - childLeft]}
        />
      );
    }
    childLeft += childWidth;
  }

  const isSelected = state.selectedPlan?.id === plan.id;
  const isHovered = !isSelected && state.hoveredPlan?.id === plan.id && !!plan.parent;

  const isMobile = useIsMobile();

  return (
    <div
      className={clsx(
        "absolute m-0.5 bg-[#d5d8ef] dark:bg-[#292235]",
        isHovered && "outline-2 outline-dotted outline-[var(--outline-color)] -outline-offset-2",
        isSelected && "z-[1] outline-2 outline-[var(--outline-color)] -outline-offset-2"
      )}
      style={{
        backgroundColor: depth ? palette[depth % palette.length] : undefined,
        width: width - 4,
        left: left,
      }}
      onClick={(e) => {
        e.stopPropagation();
        if (plan.parent) {
          if (state.selectedPlan === plan) {
            state.setSelectedPlan(null);
          } else {
            state.setSelectedPlan(plan);
          }
        }
      }}
      onMouseOver={(e) => {
        e.stopPropagation();
        if (!isMobile) state.setHoveredPlan(plan);
      }}
      onMouseOut={(e) => {
        e.stopPropagation();
        state.setHoveredPlan(null);
      }}
    >
      <div className="relative h-4 overflow-hidden whitespace-nowrap py-1.5 pb-1">
        <div className="mx-1 text-[12px] leading-[14px] text-[#666666]" style={{left: Math.max(0, visibleRange[0] + 8)}}>
          {ctxId != null ? null : depth === 0 ? <b className="ml-[5px]">Query</b> : plan.name}
        </div>
      </div>
      {sortedSubplans.length || hiddenCount ? (
        <div className="relative" style={{height: plan.childDepth * 38}}>
          {childNodes}
          {hiddenCount ? (
            <div
              className="absolute overflow-hidden rounded-[3px] bg-white opacity-50"
              style={{width: Math.max(0, hiddenWidth - 4), left: childLeft}}
            >
              <span className="block h-5 whitespace-nowrap px-1 py-1.5">{hiddenCount} hidden</span>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};
