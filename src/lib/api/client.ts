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

export const api = {
  getSchema: () => request<SchemaResponse>("/schema"),
  runQuery: (pyql: string, params?: Record<string, unknown>, signal?: AbortSignal) =>
    request<QueryResponse>("/query", {
      method: "POST",
      body: JSON.stringify({pyql, params}),
      signal,
    }),
};

export interface SchemaField {
  name: string;
  type: string;
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
