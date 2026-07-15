import {LosslessNumber, parse as parseLossless} from "lossless-json";

// A tree mirroring the exact shape of an already-decoded JSON value (same
// object keys / array indices), `true` at any leaf whose *original* JSON
// text had a decimal point or exponent (e.g. "1.0", "1e3") — recovers the
// "this is a float/decimal, not a bare int" signal that the browser's own
// JSON.parse throws away (JS has one `number` type, so "1.0" and "1" parse
// to the identical value; ScalarValue can't tell them apart from the parsed
// value alone). A float/decimal-typed column's value is always written with
// a decimal point by Python's own json.dumps (confirmed: even a whole-number
// float like 1.0 serializes as "1.0", never "1"), so the literal's own
// spelling is already a reliable signal — no schema/type lookup needed, just
// a second, lossless parse of the same response text.
export type FloatMarkerTree = boolean | FloatMarkerTree[] | {[key: string]: FloatMarkerTree};

const isFloatLiteral = (raw: string): boolean => /[.eE]/.test(raw);

const toFloatMarkerTree = (value: unknown): FloatMarkerTree => {
  if (value instanceof LosslessNumber) return isFloatLiteral(value.toString());
  if (Array.isArray(value)) return value.map(toFloatMarkerTree);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toFloatMarkerTree(v)]));
  }
  return false;
};

// Builds a FloatMarkerTree for the value at `path` within `rawText` (e.g.
// ["objects"] to align with QueryResponse.objects) — undefined if the text
// can't be parsed or the path doesn't resolve, so callers can fall back to
// "no float info" rather than throwing.
export const extractFloatMarkers = (rawText: string, path: readonly string[]): FloatMarkerTree | undefined => {
  try {
    let node: unknown = parseLossless(rawText);
    for (const key of path) {
      if (node === null || typeof node !== "object") return undefined;
      node = (node as Record<string, unknown>)[key];
    }
    return toFloatMarkerTree(node);
  } catch {
    return undefined;
  }
};

// The child marker tree for one object pointer / array index — mirrors
// valueShapeChild's contract (see typeTags.ts): undefined when there's
// nothing to walk into (no tree at all, or this position is a plain `false`
// leaf with no children).
export const floatMarkerChild = (tree: FloatMarkerTree | undefined, key: string): FloatMarkerTree | undefined => {
  if (tree === undefined || typeof tree === "boolean") return undefined;
  return Array.isArray(tree) ? tree[Number(key)] : tree[key];
};

export const isFloatMarker = (tree: FloatMarkerTree | undefined): boolean => tree === true;
