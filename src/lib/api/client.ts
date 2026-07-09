// Thin typed fetch wrapper around pylon serve's /api routes. Relative paths
// are used everywhere so this works unchanged behind the Vite dev proxy and
// behind the same-origin /api mount in production.

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
    const body = await res.text().catch(() => "");
    throw new ApiError(res.status, body || res.statusText);
  }

  return res.json() as Promise<T>;
};

export interface QueryResponse {
  rows: unknown[];
  duration_ms: number;
}

export interface ConnectionsResponse {
  project: string | null;
  // "main" (the base [database] block) plus any [database.<name>] sub-tables.
  connections: string[];
}

export const api = {
  getSchema: () => request<SchemaResponse>("/schema"),
  getConnections: () => request<ConnectionsResponse>("/connections"),
  runQuery: (pyql: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    request<QueryResponse>("/query", {
      method: "POST",
      body: JSON.stringify({pyql, params}),
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

export interface SchemaType {
  name: string;
  module: string;
  fields: SchemaField[];
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
