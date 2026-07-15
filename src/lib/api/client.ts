// Thin typed fetch wrapper around pylon serve's /api routes. Relative paths
// are used everywhere so this works unchanged behind the Vite dev proxy and
// behind the same-origin /api mount in production.

import {useGlobalsStore} from "@/lib/state/globalsStore";
import {useConfigStore} from "@/lib/state/configStore";
import {extractFloatMarkers, type FloatMarkerTree} from "@/lib/api/floatMarkers";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
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
  // The backend's error responses are {"error": "..."} — extract the
  // actual message instead of surfacing the raw JSON blob. Falls back to
  // the raw text for non-JSON error bodies (e.g. a proxy/gateway error).
  let message = text || res.statusText;
  try {
    const parsed = JSON.parse(text) as {error?: unknown};
    if (typeof parsed.error === "string") message = parsed.error;
  } catch {
    // not JSON — keep the raw text
  }
  throw new ApiError(res.status, message);
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
// ShapeNode) — lets JsonTree render type tags (`<uuid>`, enum labels, Gel's
// `(x := 1, y := 2)` tuple literal syntax) for values that aren't a known
// schema pointer, e.g. a bare top-level cast or a tuple nested inside a free
// object, the same way it already does for object properties via
// /api/schema. `null` means "no special tag for this value" (a plain
// scalar). See pylon/query.py's shape_value_tags().
export type ValueShapeTag =
  | {kind: "enum"; enumType: string}
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
  // an exact count — matches Gel's own dashboard tradeoff.
  objects: number;
  // Every registered schema type (concrete, abstract, interface, junction)
  // plus registered custom scalars.
  types: number;
}

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
      // Session globals (configured via the top bar's globals modal) apply
      // to every query automatically — callers never need to pass them. Only
      // toggled-on globals/config options are sent; a disabled one stays
      // stored client-side but is excluded here.
      body: JSON.stringify({
        pyql,
        params,
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
      }),
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
  // "enum" (the enum type's own "module::Name"), and for a *nominal*
  // "namedTuple" (the named tuple type's own "module::Name" — see
  // SchemaResponse.namedTuples).
  target?: string;
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
  // Canonical PyQL/EdgeQL-style type name for "property"/"computed" pointers
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
  // "multiLink" only, when it's a junction-typed multi-link (e.g.
  // `MultiLink[Tag, through(ProductTag)]`) — the junction type's "module::Name".
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
