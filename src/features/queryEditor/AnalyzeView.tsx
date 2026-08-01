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
// (ExplainVis/ExplainHeader/PlanDetails) — the top-level component wiring
// together the Area/Flame + Time/Cost switches, the Treemap/Flamegraph
// graph itself, and the plan-details panel below it. The `isLight` variant
// (a compact preview mode used elsewhere in gel-ui) is dropped — pylon-ui's
// Query Editor only ever renders the full view.
//
// One real gap: gel-ui's `Switch` component (`@edgedb/common/ui/switch`,
// its labelled two-option pill toggle) isn't in this codebase and its
// source wasn't available to port — `AnalyzeSwitch` below is a from-scratch
// equivalent, not a port, styled to match this file's own layout rather
// than gel-ui's exact pixel values (unlike the rest of this component,
// which mirrors explainVis.module.scss's colors/dimensions directly).

import type React from "react";

import type {CoarseGrainedNode} from "@/lib/api/client";
import {GraphType, GraphUnit, useAnalyzeState} from "@/features/queryEditor/analyzeState";
import {Treemap} from "@/features/queryEditor/AnalyzeTreemap";
import {Flamegraph} from "@/features/queryEditor/AnalyzeFlamegraph";

interface AnalyzeViewProps {
  root: CoarseGrainedNode;
}

export const AnalyzeView: React.FC<AnalyzeViewProps> = ({root}) => {
  const state = useAnalyzeState(root);

  return (
    <div className="flex h-full flex-col bg-white dark:bg-[#141414]">
      <ExplainHeader state={state} />
      {state.isAreaGraph ? <Treemap state={state} /> : <Flamegraph state={state} />}
      <PlanDetails state={state} />
    </div>
  );
};

const ExplainHeader: React.FC<{state: ReturnType<typeof useAnalyzeState>}> = ({state}) => {
  const plan = state.focusedPlan ?? state.planTree;
  const queryTimeCost = state.isTimeGraph ? `${plan.totalTime}ms` : plan.totalCost;

  return (
    <div className="flex items-center bg-[#f7f7f7] p-2 mb-0.5 dark:bg-[#242424]">
      <div className="flex gap-2">
        <AnalyzeSwitch
          labels={["Area", "Flame"]}
          value={state.isAreaGraph ? 0 : 1}
          onChange={() => state.setGraphType(state.isAreaGraph ? GraphType.flame : GraphType.area)}
        />
        <AnalyzeSwitch
          labels={["Time", "Cost"]}
          disabled={!state.planTree.totalTime}
          value={state.isTimeGraph ? 0 : 1}
          onChange={() => state.setGraphUnit(state.isTimeGraph ? GraphUnit.cost : GraphUnit.time)}
        />
      </div>
      {state.isAreaGraph && <p className="m-0 ml-auto text-[12px] leading-[14px] font-bold text-[#666] dark:text-[#c4c4c4]">{queryTimeCost}</p>}
    </div>
  );
};

// Not a port — see this file's own top comment. A small two-option pill
// toggle in the same spirit as gel-ui's Switch (labels + a single active
// index), styled with pylon-ui's own visual language since the reference's
// source wasn't available.
const AnalyzeSwitch: React.FC<{
  labels: [string, string];
  value: 0 | 1;
  onChange: () => void;
  disabled?: boolean;
}> = ({labels, value, onChange, disabled}) => (
  <div className="flex items-center rounded-md border border-border p-0.5 text-xs">
    {labels.map((label, i) => (
      <button
        key={label}
        type="button"
        disabled={disabled}
        onClick={() => {
          if (i !== value) onChange();
        }}
        className={
          "rounded-sm px-2 py-0.5 transition-colors duration-150 " +
          (value === i ? "bg-surface-hover text-accent" : "text-fg-muted hover:text-fg") +
          (disabled ? " cursor-not-allowed opacity-50" : "")
        }
      >
        {label}
      </button>
    ))}
  </div>
);

const PlanDetails: React.FC<{state: ReturnType<typeof useAnalyzeState>}> = ({state}) => {
  const plan = state.hoveredPlan || state.selectedPlan || state.planTree;

  if (!plan) {
    return <div className="p-2 text-sm italic opacity-70">Select plan node above for details</div>;
  }

  const selfStat = state.isTimeGraph ? plan.selfTime! : plan.selfCost;
  const selfPercent = (state.isTimeGraph ? plan.selfTimePercent! : plan.selfCostPercent) * 100;

  return (
    <div className="font-['Roboto'] text-sm leading-6 font-medium">
      <div className="bg-[#e5e5e5] px-4 py-1 pl-2 dark:bg-[#383838]">
        <span className="mr-1 font-bold text-[#595959] dark:text-[#999999]">{plan.name ?? "Query"}:</span>
        <span className="text-[#999999] dark:text-[#808080]">
          Self {state.isTimeGraph ? "Time:" : "Cost:"}
          <span className="ml-1 text-[#595959] dark:text-[#c4c4c4]">
            {selfStat.toPrecision(5).replace(/\.0+$/, "")}
            {state.isTimeGraph ? "ms" : ""} &nbsp; &nbsp;
            {selfPercent.toPrecision(3).replace(/\.0+$/, "")}%
          </span>
        </span>
      </div>
      <div className="flex gap-8 bg-[#f2f2f2] px-4 py-2.5 pl-2 dark:bg-[#242424]">
        <div className="flex flex-col text-[#595959] dark:text-[#c4c4c4]">
          <div>
            <span className="mr-1 text-[#999999] dark:text-[#808080]">Startup Cost:</span>
            <span>{plan.raw.cost.startup_cost}</span>
          </div>
          <div>
            <span className="mr-1 text-[#999999] dark:text-[#808080]">Total Cost:</span>
            <span>{plan.raw.cost.total_cost}</span>
          </div>
        </div>
        {plan.totalTime != null ? (
          <div className="flex flex-col text-[#595959] dark:text-[#c4c4c4]">
            <div>
              <span className="mr-1 text-[#999999] dark:text-[#808080]">Startup Time:</span>
              <span>{plan.raw.cost.actual_startup_time}ms</span>
            </div>
            <div>
              <span className="mr-1 text-[#999999] dark:text-[#808080]">Total Time:</span>
              <span>{plan.raw.cost.actual_total_time}ms</span>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
