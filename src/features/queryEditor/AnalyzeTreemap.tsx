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

// Ported from gel-ui's shared/studio/components/explainVis/treemapLayout.tsx
// (Treemap/TreemapNode/TreemapBreadcrumbs/TransitionWrapper) — same layout
// math (via the ported computeLayout), same zoom-in/out transition
// behavior, same hover/select/outline states, same hidden-node grouping
// threshold. SCSS module classes are translated to Tailwind using the exact
// colors/dimensions from explainVis.module.scss; @edgedb/common's
// useResize/useTheme/useIsMobile are swapped for pylon-ui's own equivalents.
// See analyzeState.ts's own top comment for why every node's `contextId` is
// null here (no per-node source-span data), and why the
// `subplan.contextId === ctxId` merge-skip is omitted.

import type React from "react";
import {Fragment, forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState} from "react";
import clsx from "clsx";

import {useIsMobile} from "@/lib/hooks/useIsMobile";
import {useTheme} from "@/lib/theme/useTheme";
import type {AnalyzeState, Plan} from "@/features/queryEditor/analyzeState";
import {computeLayout, darkPalette, lightPalette} from "@/features/queryEditor/analyzeTreemapLayout";
import {useAnalyzeResize as useResize} from "@/features/queryEditor/useAnalyzeResize";

function getPlanDepth(plan: Plan) {
  let depth = 0;
  let parent = plan.parent;
  while (parent) {
    depth++;
    parent = parent.parent;
  }
  return depth;
}

const MARGIN = 4;

export const Treemap: React.FC<{state: AnalyzeState}> = ({state}) => {
  const ref = useRef<HTMLDivElement>(null);

  const [size, setSize] = useState<[number, number] | null>(null);
  const sizeCache = useRef<[number, number] | null>(null);

  useResize(
    ref,
    ({width, height}) => {
      const newSize: [number, number] = [width - MARGIN, height - MARGIN];
      if (state.treemapTransition) {
        sizeCache.current = newSize;
      } else {
        setSize(newSize);
      }
    },
    [state.treemapTransition]
  );

  const plan = state.focusedPlan ?? state.planTree;

  useEffect(() => {
    if (!state.treemapTransition && sizeCache.current) {
      setSize(sizeCache.current);
    }
    if (state.treemapTransition?.kind === "out" && !state.treemapTransition.pos) {
      let target: Plan | null = state.treemapTransition.from;
      const container = ref.current!.firstChild! as HTMLDivElement;
      while (target) {
        const el = container.querySelector(`[data-plan-id="${target.id}"]`);
        if (el) {
          state.updateTreemapTransitionPos(el as HTMLDivElement);
          return;
        }
        target = target.parent;
      }
      // Fallback to container - shouldn't ever happen
      state.updateTreemapTransitionPos(container);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.treemapTransition]);

  const children: React.ReactElement[] = [];
  if (size != null) {
    const props: TreemapNodeProps = {
      state,
      depth: getPlanDepth(plan),
      plan: plan,
      pos: {
        top: 0,
        left: 0,
        width: 1,
        height: 1,
      },
      parentSize: size,
    };
    const trans = state.treemapTransition;
    if (trans) {
      if (trans.kind === "in") {
        children.push(
          <TreemapNode key={`trans-in-${trans.from.id}`} {...props} depth={getPlanDepth(trans.from)} plan={trans.from} />,
          <TransitionWrapper key={`trans-in-${plan.id}`} {...props} startPos={trans.pos!} />
        );
      } else {
        children.push(
          <TreemapNode
            key={`trans-out-${plan.id}`}
            {...props}
            parentSize={!state.focusedPlan ? [size[0], size[1] + 32] : size}
          />,
          trans.pos ? (
            <TransitionWrapper
              key={`trans-out-${trans.from.id}`}
              {...props}
              depth={getPlanDepth(trans.from)}
              plan={trans.from}
              pos={trans.pos}
              startPos={props.pos}
            />
          ) : (
            <TreemapNode key={`trans-out-${trans.from.id}`} {...props} depth={getPlanDepth(trans.from)} plan={trans.from} />
          )
        );
      }
    } else {
      children.push(<TreemapNode key={`root-${plan.id}`} {...props} />);
    }
  }

  return (
    <div style={{display: "contents", pointerEvents: state.treemapTransition ? "none" : undefined}}>
      <TreemapBreadcrumbs state={state} />
      <div
        ref={(el) => {
          (ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
          state.treemapContainerRef.current = el;
        }}
        className="relative h-full -m-0.5 [--outline-color:#468bff] dark:bg-[#1c1c1c] dark:[--outline-color:#74a6fc]"
        onMouseLeave={() => state.setHoveredPlan(null)}
      >
        {children}
      </div>
    </div>
  );
};

function TransitionWrapper({
  state,
  startPos,
  ...props
}: TreemapNodeProps & {
  startPos: TreemapNodeProps["pos"];
}) {
  const ref = useRef<HTMLDivElement>(null);

  const [first, setFirst] = useState(true);

  useLayoutEffect(() => {
    if (first && ref.current) {
      const el = ref.current;

      // Force layout before flipping to the final position, so the
      // transition (top/left/width/height 0.2s) actually animates from
      // `startPos` instead of snapping straight to `props.pos`.
      // eslint-disable-next-line @typescript-eslint/no-unused-expressions
      el.clientHeight;
      setFirst(false);

      el.addEventListener("transitionend", () => state.finishTreemapTransition(), {once: true});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [first, ref.current]);

  return <TreemapNode ref={ref} state={state} {...props} transitionActive pos={first ? startPos : props.pos} />;
}

const TreemapBreadcrumbs: React.FC<{state: AnalyzeState}> = ({state}) => {
  const breadcrumbs: Plan[] = [];

  let plan = state.focusedPlan;
  while (plan) {
    breadcrumbs.unshift(plan);
    plan = plan.parent;
  }

  return (
    <div
      className={clsx(
        "flex shrink-0 overflow-x-auto text-[11px] leading-[15px] font-medium text-[#666666] transition-[height] duration-200 [scrollbar-width:none]",
        breadcrumbs.length === 0 ? "h-0" : "h-8"
      )}
    >
      <div className="mb-0.5 flex w-full min-w-max items-center bg-[#f7f7f7] px-1 dark:bg-[#242424] dark:text-[#b3b3b3]">
        {breadcrumbs.map((plan, i) => (
          <Fragment key={plan.id}>
            <div
              className="mx-0.5 max-w-[150px] shrink-0 truncate rounded-[3px] px-1 py-0.5 cursor-pointer hover:bg-black/5 dark:hover:bg-[#383838]"
              onClick={() => state.treemapZoomOut(plan.parent ? plan : null)}
              style={{pointerEvents: i === breadcrumbs.length - 1 ? "none" : undefined}}
            >
              <span>{i === 0 ? "Query" : plan.name}</span>
            </div>
            {i !== breadcrumbs.length - 1 ? <span className="text-[#b3b3b3] dark:text-[#666666]">{">"}</span> : null}
          </Fragment>
        ))}
      </div>
    </div>
  );
};

interface TreemapNodeProps {
  state: AnalyzeState;
  plan: Plan;
  pos: {top: number; left: number; width: number; height: number};
  parentSize: [number, number];
  depth: number;
  transitionActive?: boolean;
}

export const TreemapNode = forwardRef<HTMLDivElement, TreemapNodeProps>(function _TreemapNode(
  {state, plan, pos, parentSize, depth, transitionActive},
  forwardedRef
) {
  const {resolvedTheme} = useTheme();
  const palette = resolvedTheme === "light" ? lightPalette : darkPalette;

  const ref = useRef<HTMLDivElement>(null);
  useImperativeHandle(forwardedRef, () => ref.current!);

  const parentArea = parentSize[0] * parentSize[1];

  const isTimeGraph = state.isTimeGraph;

  // Always null — no per-node source-span data (see this file's own top comment).
  const ctxId = plan.contextId;

  const layout = useMemo(() => {
    let subplansTotal = 0;
    const subplans: {item: Plan | null | number; area: number}[] = [];
    let hiddenArea = 0;
    let hiddenCount = 0;
    for (const subplan of plan.subPlans ?? []) {
      subplansTotal += isTimeGraph ? subplan.totalTime! : subplan.totalCost;
      const area = isTimeGraph ? subplan.totalTime! / plan.totalTime! : subplan.totalCost / plan.totalCost;
      if (parentArea * area > 400) {
        subplans.push({item: subplan, area});
      } else {
        hiddenArea += area;
        hiddenCount++;
      }
    }
    if (hiddenCount) {
      subplans.push({item: hiddenCount, area: hiddenArea});
    }

    return computeLayout(parentSize[0] / parentSize[1], [
      ...subplans,
      {
        item: null,
        area: Math.max(0, isTimeGraph ? (plan.totalTime! - subplansTotal) / plan.totalTime! : (plan.totalCost - subplansTotal) / plan.totalCost),
      },
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, parentArea, isTimeGraph]);

  const isSelected = state.selectedPlan?.id === plan.id;
  const isHovered = !isSelected && state.hoveredPlan?.id === plan.id && !!plan.parent;

  const isMobile = useIsMobile();

  return (
    <div
      ref={ref}
      className={clsx(
        "absolute box-border z-[1] border border-black/[0.03] bg-[#d5d8ef] dark:border-white/[0.04] dark:bg-[#292235]",
        transitionActive && "transition-[top,left,width,height] duration-200",
        isSelected && "z-[1] outline-2 outline-[var(--outline-color)] -outline-offset-2",
        isHovered && "outline-2 outline-dotted outline-[var(--outline-color)] -outline-offset-2"
      )}
      data-plan-id={plan.id}
      style={{
        backgroundColor: depth ? palette[depth % palette.length] : undefined,
        top: `calc(${pos.top * 100}% + 2px)`,
        left: `calc(${pos.left * 100}% + 2px`,
        width: `calc(${pos.width * 100}% - 4px)`,
        height: `calc(${pos.height * 100}% - 4px)`,
      }}
    >
      {layout ? (
        <div className="relative ml-0.5 mt-0.5 h-[calc(100%-4px)] w-[calc(100%-4px)]">
          {layout.map(({item, ...pos}, i) => {
            if (!pos.width || !pos.height) {
              return null;
            }
            if (item && typeof item === "object") {
              return (
                <TreemapNode
                  key={`${plan.id}-${i}`}
                  state={state}
                  plan={item}
                  pos={pos}
                  parentSize={[parentSize[0] * pos.width - MARGIN * 2, parentSize[1] * pos.height - MARGIN * 2]}
                  depth={depth + 1}
                />
              );
            }

            const w = pos.width * parentSize[0],
              h = pos.height * parentSize[1];
            const vertLabel = h > w * 1.5;
            const showLabel = w * h > 800 && (vertLabel ? w : h) > 20;
            return item === null ? (
              <div
                key={`planLabel-${i}`}
                className={clsx("absolute z-0 flex justify-end overflow-hidden text-right", vertLabel && "flex-col")}
                style={{
                  top: pos.top * 100 + "%",
                  left: pos.left * 100 + "%",
                  width: `calc(${pos.width * 100}%)`,
                  height: `calc(${pos.height * 100}%)`,
                }}
                onClick={() => {
                  if (plan.parent) {
                    if (state.selectedPlan === plan) {
                      state.setSelectedPlan(null);
                    } else {
                      state.setSelectedPlan(plan);
                    }
                  }
                }}
                onMouseOver={() => {
                  if (!isMobile) state.setHoveredPlan(plan);
                }}
                onMouseOut={() => state.setHoveredPlan(null)}
                onDoubleClick={() => {
                  if (plan.parent) state.treemapZoomIn(plan, ref.current!);
                }}
              >
                {showLabel ? (
                  <span
                    className={clsx(
                      "m-1 block overflow-hidden text-ellipsis whitespace-nowrap",
                      vertLabel && "[writing-mode:vertical-rl] text-left"
                    )}
                  >
                    {ctxId != null ? null : depth === 0 ? (
                      <b className="text-[12px] leading-[14px] text-[#666666]">Query</b>
                    ) : (
                      plan.name
                    )}
                  </span>
                ) : null}
              </div>
            ) : (
              <div
                key={`hiddenPlans-${i}`}
                className="absolute z-0 flex justify-end overflow-hidden rounded-[3px] bg-white text-right opacity-50"
                style={{
                  top: pos.top * 100 + "%",
                  left: pos.left * 100 + "%",
                  width: `calc(${pos.width * 100}% - 4px)`,
                  height: `calc(${pos.height * 100}% - 4px)`,
                }}
              >
                {showLabel ? <span className="m-1 block overflow-hidden whitespace-nowrap">{item} hidden</span> : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
});
