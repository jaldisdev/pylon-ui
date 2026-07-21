// Renders an `analyze <query>` result as REPL text — the annotated query
// line (➊➋➌ markers planted at each shape path's marker_offset) followed by
// the coarse-grained plan table, matching Gel/EdgeQL's own `analyze` REPL
// output:
//
//   analyze select ➊  Hero {name, secret_identity, ➋  villains: {name, ➌  nemesis: {name}}};
//
//   ──────────────────────── Coarse-grained Query Plan ────────────────────────
//                     │ Time     Cost Loops Rows Width │ Relations
//   ➊ root            │  0.0 69709.48   1.0  0.0    32 │ Hero
//   ╰──➋ .villains    │  0.0     92.9   0.0  0.0    32 │ Villain, Hero.villains
//   ╰──➌ .nemesis     │  0.0     8.18   0.0  0.0    32 │ Hero
//
// Column widths are computed from the actual data (Gel's own CLI does the
// same — its "Cost" column above is wider than its own header to fit
// "69709.48"), not hardcoded, so this holds up for arbitrarily-shaped plans.

import type {CoarseGrainedNode} from "@/lib/api/client";

const CIRCLED_DIGITS = ["➊", "➋", "➌", "➍", "➎", "➏", "➐", "➑", "➒", "➓"];
const marker = (n: number): string => CIRCLED_DIGITS[n - 1] ?? `(${n})`;

interface FlatRow {
  marker: string;
  label: string;
  markerOffset: number | null;
  node: CoarseGrainedNode;
}

// Flattens the tree in *source-text order* (by marker_offset), not tree
// order — a shape with two sibling links can have either one appear first
// in the plan tree depending on how Postgres happened to join them, but the
// markers/rows must still read top-to-bottom the way the query was written.
const flatten = (root: CoarseGrainedNode): FlatRow[] => {
  const all: CoarseGrainedNode[] = [];
  const walk = (node: CoarseGrainedNode) => {
    all.push(node);
    for (const child of node.children) walk(child.node);
  };
  walk(root);

  const withOffset = all.filter((n) => n.marker_offset !== null);
  const withoutOffset = all.filter((n) => n.marker_offset === null);
  withOffset.sort((a, b) => (a.marker_offset as number) - (b.marker_offset as number));
  const ordered = [...withOffset, ...withoutOffset];

  return ordered.map((node, i) => ({
    marker: marker(i + 1),
    label: node.path === "root" ? "root" : `.${node.path.split(".").pop()}`,
    markerOffset: node.marker_offset,
    node,
  }));
};

// Matches explainVis/state.ts's own convention: total time across every
// loop iteration, not one iteration's average.
const totalTime = (node: CoarseGrainedNode): number =>
  node.cost.actual_total_time !== null ? node.cost.actual_total_time * (node.cost.actual_loops ?? 1) : 0;

const padLeft = (s: string, width: number): string => s.padStart(width);
const padRight = (s: string, width: number): string => s.padEnd(width);

// Inserts each row's `marker ` text at its own marker_offset inside `query`
// — highest offset first, so an earlier insertion never shifts a
// not-yet-processed later offset out of place.
const annotateQuery = (query: string, rows: FlatRow[]): string => {
  const withOffset = rows.filter((r) => r.markerOffset !== null);
  withOffset.sort((a, b) => (b.markerOffset as number) - (a.markerOffset as number));
  let text = query;
  for (const row of withOffset) {
    const offset = row.markerOffset as number;
    text = text.slice(0, offset) + row.marker + "  " + text.slice(offset);
  }
  return text;
};

export const formatAnalyzeResult = (query: string, root: CoarseGrainedNode): string => {
  const rows = flatten(root);

  const labelCells = rows.map((r) => (r.node.path === "root" ? r.marker + " " + r.label : "╰──" + r.marker + " " + r.label));
  const timeCells = ["Time", ...rows.map((r) => totalTime(r.node).toFixed(1))];
  const costCells = ["Cost", ...rows.map((r) => r.node.cost.total_cost.toFixed(2))];
  const loopsCells = ["Loops", ...rows.map((r) => (r.node.cost.actual_loops ?? 0).toFixed(1))];
  const rowsCells = ["Rows", ...rows.map((r) => (r.node.cost.actual_rows ?? 0).toFixed(1))];
  const widthCells = ["Width", ...rows.map((r) => String(r.node.cost.plan_width))];
  const relationsCells = ["Relations", ...rows.map((r) => r.node.relations.join(", "))];

  const labelWidth = Math.max(0, ...labelCells.map((c) => c.length));
  const timeWidth = Math.max(...timeCells.map((c) => c.length));
  const costWidth = Math.max(...costCells.map((c) => c.length));
  const loopsWidth = Math.max(...loopsCells.map((c) => c.length));
  const rowsWidth = Math.max(...rowsCells.map((c) => c.length));
  const widthWidth = Math.max(...widthCells.map((c) => c.length));

  const renderLine = (label: string, i: number): string =>
    [
      padRight(label, labelWidth),
      "│",
      padLeft(timeCells[i], timeWidth),
      padLeft(costCells[i], costWidth),
      padLeft(loopsCells[i], loopsWidth),
      padLeft(rowsCells[i], rowsWidth),
      padLeft(widthCells[i], widthWidth),
      "│",
      relationsCells[i],
    ].join(" ");

  const header = renderLine("", 0);
  const dataLines = rows.map((_, i) => renderLine(labelCells[i], i + 1));

  const title = " Coarse-grained Query Plan ";
  const totalWidth = header.length;
  const dashes = Math.max(0, totalWidth - title.length);
  const titleLine = "─".repeat(Math.ceil(dashes / 2)) + title + "─".repeat(Math.floor(dashes / 2));

  return [annotateQuery(query, rows) + ";", "", titleLine, header, ...dataLines].join("\n");
};
