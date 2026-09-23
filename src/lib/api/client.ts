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

// Thin typed fetch wrapper around pylon serve's /api routes. Relative paths
// are used everywhere so this works unchanged behind the Vite dev proxy and
// behind the same-origin /api mount in production.

import {useGlobalsStore} from "@/lib/state/globalsStore";
import {useConfigStore} from "@/lib/state/configStore";
import {extractFloatMarkers, type FloatMarkerTree} from "@/lib/api/floatMarkers";

export interface QueryErrorPosition {
  start: number;
  end: number;
  line: number;
  col: number;
}

// Plain, JSON-persistable projection of an ApiError's structured fields —
// used wherever an error needs to survive round-tripping through
// localStorage (query/REPL history), where an actual Error instance
// wouldn't reliably serialize back.
export interface QueryErrorInfo {
  message: string;
  errorType?: string;
  hint?: string;
  details?: string;
  position?: QueryErrorPosition;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    // Populated for a PylonError raised during /api/query (or /api/ai/chat)
    // — see pylon/server/asgi.py's _pylon_error_payload. errorType is the
    // real Python exception class name (e.g. "InvalidQueryError"); position
    // (when present — a bare Python-side error has none) is the compiler's
    // own source-span into the query text.
    public errorType?: string,
    public hint?: string,
    public details?: string,
    public position?: QueryErrorPosition
  ) {
    super(message);
    this.name = "ApiError";
  }

  toQueryErrorInfo(): QueryErrorInfo {
    return {message: this.message, errorType: this.errorType, hint: this.hint, details: this.details, position: this.position};
  }
}

// Every tab is nested under /:branch/<tab> (see App.tsx's route table), so
// the current URL's first path segment is always the selected connection —
// read directly here instead of threading it through every api.* call site.
// Falls back to "main" (the frontend's own name for the base [database]
// block) for the rare case this runs before the router has mounted at all.
const currentConnection = (): string => window.location.pathname.split("/")[1] || "main";

const throwIfNotOk = async (res: Response): Promise<void> => {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  // The backend's error responses are {"error": "...", "errorType": "...",
  // "hint"?, "details"?, "position"?} — see _pylon_error_payload in
  // pylon/server/asgi.py. Extract these instead of surfacing the raw JSON
  // blob; falls back to the raw text for non-JSON error bodies (e.g. a
  // proxy/gateway error), which have none of the structured fields.
  let message = text || res.statusText;
  let errorType: string | undefined;
  let hint: string | undefined;
  let details: string | undefined;
  let position: QueryErrorPosition | undefined;
  try {
    const parsed = JSON.parse(text) as {
      error?: unknown;
      errorType?: unknown;
      hint?: unknown;
      details?: unknown;
      position?: unknown;
    };
    if (typeof parsed.error === "string") message = parsed.error;
    if (typeof parsed.errorType === "string") errorType = parsed.errorType;
    if (typeof parsed.hint === "string") hint = parsed.hint;
    if (typeof parsed.details === "string") details = parsed.details;
    if (parsed.position && typeof parsed.position === "object") position = parsed.position as QueryErrorPosition;
  } catch {
    // not JSON — keep the raw text
  }
  throw new ApiError(res.status, message, errorType, hint, details, position);
};

const doFetch = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  await throwIfNotOk(res);
  return res.json() as Promise<T>;
};

// Same request/error handling as doFetch, but also re-parses the raw
// response text with a lossless number parser to recover each value's
// original "was this written with a decimal point" spelling — see
// floatMarkers.ts for why this can't be done from the already-parsed JSON
// alone. Only /query needs this (it's the only route whose response values
// get rendered as arbitrary, possibly-float scalars in JsonTree); every
// other route just uses plain doFetch.
const fetchQueryResponse = async (path: string, init: RequestInit): Promise<QueryResponse> => {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  await throwIfNotOk(res);
  const text = await res.text();
  return {...(JSON.parse(text) as QueryResponse), floatMarkers: extractFloatMarkers(text, ["objects"])};
};

// Process-level routes (schema/globals/connections/models) are derived from
// pylon.finalize()'s schema-dir scan or the TOML config itself, never from a
// live DB round trip — identical regardless of which connection is
// selected, so they're never prefixed.
const request = <T>(path: string, init?: RequestInit): Promise<T> => doFetch<T>(path, init);

// Routes that actually read/write database data (query/stats/ai-chat) are
// addressed as /api/<connection>/<path>, matching the backend's
// _split_connection_path (pylon/server/asgi.py) and the frontend's own
// /<branch>/... URL scheme.
const connectionRequest = <T>(path: string, init?: RequestInit): Promise<T> =>
  doFetch<T>(`/${currentConnection()}${path}`, init);

// A position-free "value shape" tag tree, aligned with the already-decoded
// JSON in QueryResponse.objects (not the compiler's position-based
// ShapeNode) — lets JsonTree render type tags (`<uuid>`, enum labels, the
// `(x := 1, y := 2)` tuple literal syntax) for values that aren't a known
// schema pointer, e.g. a bare top-level cast or a tuple nested inside a free
// object, the same way it already does for object properties via
// /api/schema. `null` means "no special tag for this value" (a plain
// scalar). See pylon/query.py's shape_value_tags().
export type ValueShapeTag =
  | {kind: "enum"; enumType: string}
  // A fixed-precision decimal with no schema pointer behind it (a bare
  // cast, or arithmetic over one) — the only way the frontend can tell it
  // apart from a plain float, since both serialize identically once whole.
  // See pylon/server/asgi.py's _merge_decimal_shape.
  | {kind: "decimal"}
  | {kind: "namedTuple"; typeName: string | null; members: {key: string | null; shape: ValueShapeTag}[] | null}
  | {kind: "object"; typeName: string | null; pointers: Record<string, ValueShapeTag>}
  | {kind: "array"; element: ValueShapeTag}
  | null;

export interface QueryResponse {
  objects: unknown[];
  duration_ms: number;
  shape: ValueShapeTag;
  // A FloatMarkerTree aligned with `objects` itself (not `shape`, which is
  // the shape of one element) — see floatMarkers.ts. Always present on a
  // live response; only optional so a persisted REPL history entry from
  // before this field existed still type-checks.
  floatMarkers?: FloatMarkerTree;
}

export interface ConnectionsResponse {
  project: string | null;
  // "main" (the base [database] block) plus any [database.<name>] sub-tables.
  connections: string[];
}

export interface GlobalInfo {
  module: string;
  name: string;
  typeName: string | null;
  required: boolean;
}

export interface GlobalsResponse {
  // Only settable session globals — computed globals (Global[T, "select
  // ..."]) are derived at query time and never listed here.
  globals: GlobalInfo[];
}

export interface ConfigOptionInfo {
  name: string;
  // Only "bool" today — the only type pylon-core's SessionConfig knows.
  typeName: string;
  default: unknown;
}

export interface ConfigOptionsResponse {
  options: ConfigOptionInfo[];
}

export interface ChatModelInfo {
  name: string;
  model: string;
  apiStyle: "openai" | "anthropic";
}

export interface ModelsResponse {
  // Only "chat"-purpose models — embedding models are never user-selectable,
  // they're picked implicitly via a type's VectorIndex.
  models: ChatModelInfo[];
}

export interface AiChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiChatRequest {
  modelName: string;
  pylonType: string;
  indexName: string | null;
  // Optional PyQL expression narrowing which objects vector::search's first
  // argument scopes over, e.g. "select Type filter .property = value" — null
  // (or empty) searches every object of pylonType instead.
  contextQuery: string | null;
  // Both the vector::search query text *and* the LLM's question — no
  // separate search-text input.
  message: string;
  history: AiChatMessage[];
}

export interface AiChatResult {
  object: Record<string, unknown>;
  distance: number;
}

export interface AiChatResponse {
  reply: string;
  results: AiChatResult[];
}

export interface StatsResponse {
  // Live-tuple estimate from Postgres's own stats (pg_stat_user_tables), not
  // an exact count — a deliberate accuracy/cost tradeoff for a dashboard tile.
  objects: number;
  // Every registered schema type (concrete, abstract, interface, junction)
  // plus registered custom scalars.
  types: number;
}

// Cost/timing figures for one CoarseGrainedNode — lifted verbatim from
// whichever Postgres EXPLAIN plan node is the top of that shape path's own
// subtree (see pylon-core's analyze.rs::PlanCost). actual_* fields are only
// null if EXPLAIN somehow ran without ANALYZE, which analyze_compiled never
// does — kept optional here defensively, not because it's expected.
export interface PlanCost {
  startup_cost: number;
  total_cost: number;
  plan_rows: number;
  plan_width: number;
  actual_startup_time: number | null;
  actual_total_time: number | null;
  actual_rows: number | null;
  actual_loops: number | null;
}

// One node of the `analyze <query>` coarse-grained tree — see pylon-core's
// analyze.rs::CoarseGrainedNode, which this mirrors field-for-field.
export interface CoarseGrainedNode {
  // Dotted shape path: "root", "root.villains", "root.villains.nemesis", ...
  path: string;
  // Byte offset into the *original* query text (the same string passed to
  // api.analyzeQuery) to plant this path's marker at — null when the
  // originating shape element carried none (e.g. an implicit `{ id }`).
  marker_offset: number | null;
  // Relation names touched by this path's own plan nodes — a junction-
  // backed link's own path lists both the junction table and the target
  // table together (see analyze.rs's resolve_subtree_path doc comment).
  relations: string[];
  cost: PlanCost;
  children: {name: string; node: CoarseGrainedNode}[];
}

export interface AnalyzeResponse {
  coarse_grained: CoarseGrainedNode;
  duration_ms: number;
}

// Shared by runQuery/analyzeQuery — session globals/config apply to every
// query automatically; only toggled-on entries are sent, matching
// runQuery's existing (pre-existing) behavior exactly.
const sessionExtras = () => ({
  globals: Object.fromEntries(
    Object.entries(useGlobalsStore.getState().entries)
      .filter(([, entry]) => entry.enabled)
      .map(([key, entry]) => [key, entry.value])
  ),
  config: Object.fromEntries(
    Object.entries(useConfigStore.getState().entries)
      .filter(([, entry]) => entry.enabled)
      .map(([key, entry]) => [key, entry.value])
  ),
});

export const api = {
  getSchema: () => request<SchemaResponse>("/schema"),
  getConnections: () => request<ConnectionsResponse>("/connections"),
  getModels: () => request<ModelsResponse>("/models"),
  getGlobals: () => request<GlobalsResponse>("/globals"),
  getConfigOptions: () => request<ConfigOptionsResponse>("/config-options"),
  getStats: () => connectionRequest<StatsResponse>("/stats"),
  runQuery: (pyql: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    fetchQueryResponse(`/${currentConnection()}/query`, {
      method: "POST",
      body: JSON.stringify({pyql, params, ...sessionExtras()}),
      signal,
    }),
  // `pyql` doesn't need a leading "analyze" keyword already written — the
  // backend (Client.analyze()) adds it automatically if missing, mirroring
  // how ReplTab/QueryEditorTab detect the prefix only to decide *which*
  // api.* method to call, not to transform the text itself.
  analyzeQuery: (pyql: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    connectionRequest<AnalyzeResponse>("/analyze", {
      method: "POST",
      body: JSON.stringify({pyql, params, ...sessionExtras()}),
      signal,
    }),
  runAiChat: (body: AiChatRequest, signal?: AbortSignal) =>
    connectionRequest<AiChatResponse>("/ai/chat", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
};

export type SchemaPointerKind = "property" | "link" | "multiLink" | "computed" | "enum" | "namedTuple" | "array";

export interface SchemaPointer {
  name: string;
  kind: SchemaPointerKind;
  // Present for "link"/"multiLink" (the target type's "module::Name"), for
  // "enum" (the enum type's own "module::Name"), for a *nominal*
  // "namedTuple" (the named tuple type's own "module::Name" — see
  // SchemaResponse.namedTuples), and for a "computed" that selects objects
  // rather than a scalar (the type it selects — see lib/schema/pointers.ts).
  target?: string;
  // "computed" with a `target` only — whether it selects many objects. A
  // stored link says this through its own kind ("link" vs "multiLink");
  // a computed one has just the one kind for both.
  multi?: boolean;
  // "namedTuple" only, when it's a *structural* pylon.Tuple[...] (no
  // registered type to reference via `target` — the shape is declared
  // inline here instead).
  members?: NamedTupleMember[];
  // "array" only — the element type (pylon.Array[T] or a bare list[T]).
  // `name` is always null on this entry (an array element isn't named);
  // otherwise the same {kind, target?, typeName?, members?} shape as one
  // NamedTupleMember, reused so scalar/enum/namedTuple element types all
  // classify identically to a tuple member's own type.
  element?: NamedTupleMember;
  // Canonical PyQL type name for "property"/"computed" pointers
  // (e.g. "std::str", "std::uuid", "cal::local_date") — shown below the
  // pointer name in the Data Explorer's column headers, and used to decide
  // which types get a `<tag>` prefix on values (see lib/schema/typeTags.ts).
  typeName?: string;
  // "property"/"link" only — sourced from Pylon's own PointerMeta, not
  // derivable from a value's shape. A readonly pointer is still settable
  // once, at insert time — only post-creation updates are blocked.
  readonly?: boolean;
  required?: boolean;
  // True if the pointer has a default/default_factory — lets the insert-row
  // UI skip a required-but-defaulted property (e.g. a sequence number)
  // instead of blocking commit waiting for a value the DB will supply.
  hasDefault?: boolean;
  // Set on a junction-typed multi-link (e.g. `MultiLink[Tag,
  // through(ProductTag)]`) or a junction-backed single link (e.g.
  // `Link[Org, through(Marriage)]`) — the junction type's "module::Name".
  // A "link" pointer reports this alongside readonly/required/hasDefault;
  // a "multiLink" pointer reports only this.
  through?: string;
}

export interface VectorIndexInfo {
  // null for a bare/default VectorIndex (not assigned to a named attribute).
  indexName: string | null;
  model: string;
  // Pointers the index was declared with (what actually got embedded) — the
  // AI tab's Index select shows these, and /api/ai/chat uses them server-side
  // to build its context, so the frontend never needs to pass pointers itself.
  pointers: string[];
}

export interface SchemaType {
  name: string;
  module: string;
  // Real Pylon inheritance info (@pylon.abstract/@pylon.interface + concrete
  // subtypes) — an abstract type can't be inserted directly; the Data
  // Explorer's Insert button offers a subtype picker when there's more than
  // one concrete option instead.
  abstract: boolean;
  // @pylon.junction — a through-typed multi-link's own link-property storage
  // (e.g. ProductTag), entirely compiler-managed and never inserted/queried
  // directly by a user. Still present here (link-property editing looks up
  // a through-type's own pointers by name), but the Data Explorer's type
  // picker filters these out.
  junction: boolean;
  bases: string[]; // direct Pylon base types' "module::Name", if any
  pointers: SchemaPointer[];
  vectorIndexes: VectorIndexInfo[];
}

export interface SchemaEnum {
  name: string;
  module: string;
  members: string[];
}

export type NamedTupleMemberKind = "scalar" | "enum" | "namedTuple";

export interface NamedTupleMember {
  // null for an unnamed/positional element of a structural tuple
  // (e.g. `Tuple[Str, Bool]`); always set for a nominal named-tuple's field.
  name: string | null;
  kind: NamedTupleMemberKind;
  // "scalar" only — e.g. "std::float64".
  typeName?: string;
  // "enum", or a *nominal* "namedTuple" member — the target type's own "module::Name".
  target?: string;
  // A *structural* "namedTuple" member (a nested `Tuple[...]`) — its elements, inline.
  members?: NamedTupleMember[];
  // Only meaningful for a nominal named-tuple's own fields — a structural
  // tuple element has no independent optionality, so this is omitted there.
  required?: boolean;
}

export interface SchemaNamedTuple {
  module: string;
  name: string;
  members: NamedTupleMember[];
}

export interface SchemaResponse {
  types: SchemaType[];
  enums: SchemaEnum[];
  namedTuples: SchemaNamedTuple[];
}
