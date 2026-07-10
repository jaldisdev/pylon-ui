// Thin typed fetch wrapper around pylon serve's /api routes. Relative paths
// are used everywhere so this works unchanged behind the Vite dev proxy and
// behind the same-origin /api mount in production.

import {useGlobalsStore} from "@/lib/state/globalsStore";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
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
  }

  return res.json() as Promise<T>;
};

export interface QueryResponse {
  objects: unknown[];
  duration_ms: number;
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
  // argument scopes over, e.g. "select Type filter .field = value" — null
  // (or empty) searches every object of pylonType instead.
  contextQuery: string | null;
  // Both the vector::search query text *and* the LLM's question — no
  // separate search-text field.
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

export const api = {
  getSchema: () => request<SchemaResponse>("/schema"),
  getConnections: () => request<ConnectionsResponse>("/connections"),
  getModels: () => request<ModelsResponse>("/models"),
  getGlobals: () => request<GlobalsResponse>("/globals"),
  runQuery: (pyql: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    request<QueryResponse>("/query", {
      method: "POST",
      // Session globals (configured via the top bar's globals modal) apply
      // to every query automatically — callers never need to pass them.
      body: JSON.stringify({pyql, params, globals: useGlobalsStore.getState().values}),
      signal,
    }),
  runAiChat: (body: AiChatRequest, signal?: AbortSignal) =>
    request<AiChatResponse>("/ai/chat", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    }),
};

export type SchemaFieldKind = "property" | "link" | "multiLink" | "computed" | "enum";

export interface SchemaField {
  name: string;
  kind: SchemaFieldKind;
  // Present for "link"/"multiLink" (the target type's "module::Name") and for
  // "enum" (the enum type's own "module::Name").
  target?: string;
  // Canonical PyQL/EdgeQL-style type name for "property"/"computed" fields
  // (e.g. "std::str", "std::uuid", "cal::local_date") — shown below the field
  // name in the Data Explorer's column headers, and used to decide which
  // types get a `<tag>` prefix on values (see lib/schema/typeTags.ts).
  typeName?: string;
}

export interface VectorIndexInfo {
  // null for a bare/default VectorIndex (not assigned to a named attribute).
  indexName: string | null;
  model: string;
  // Fields the index was declared with (what actually got embedded) — the
  // AI tab's Index select shows these, and /api/ai/chat uses them server-side
  // to build its context, so the frontend never needs to pass fields itself.
  fields: string[];
}

export interface SchemaType {
  name: string;
  module: string;
  fields: SchemaField[];
  vectorIndexes: VectorIndexInfo[];
}

export interface SchemaEnum {
  name: string;
  module: string;
  members: string[];
}

export interface SchemaResponse {
  types: SchemaType[];
  enums: SchemaEnum[];
}
