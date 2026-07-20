export interface FuzzyMatch {
  // Indices in `target` that matched a query character, in order — used to
  // highlight matched characters in the quick-switcher's own result list.
  indices: number[];
  // Lower is better: rewards contiguous, early matches over scattered ones.
  score: number;
}

// Subsequence fuzzy match: every query character must appear in `target`, in
// order, but not necessarily contiguously (so "auth" matches "OAuthGrant").
// Returns null when the query doesn't match at all.
export const fuzzyMatch = (query: string, target: string): FuzzyMatch | null => {
  if (!query) return {indices: [], score: 0};

  const q = query.toLowerCase();
  const t = target.toLowerCase();
  const indices: number[] = [];
  let qi = 0;

  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  if (qi < q.length) return null;

  const span = indices[indices.length - 1] - indices[0] + 1;
  const score = span + indices[0] * 0.1;
  return {indices, score};
};
