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

// Ported from gel-ui's shared/studio/tabs/queryEditor/state/thumbnailGen.tsx
// — a small syntax-highlighted "thumbnail" of a query's actual text,
// rendered as colored SVG rects per token (one row per source line) instead
// of readable text, used for each Query Editor history entry. Adapted to
// pylon-ui's own PyQL parser/highlightStyle: Gel extracts a fixed
// `SyntaxColour` enum's class->colour mapping from its highlight
// stylesheet; this instead extracts the raw `--syntax-*` CSS variable name
// directly (pylon-ui's theme.ts uses different variable names — keyword/
// string/operator/... — not Gel's purple/green/blue/... palette), so each
// rect's fill is just `var(--syntax-name)` with no enum indirection needed.

import {pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {highlightStyle} from "@/lib/editor/theme";
import {highlightTree} from "@lezer/highlight";

// CodeMirror's HighlightStyle compiles down to a style-mod StyleModule whose
// `.rules` are generated CSS strings like ".ͼ1 {color: var(--syntax-keyword);}"
// — same extraction Gel's thumbnailGen performs, just capturing the
// variable's own name instead of mapping it through an enum. Note the class
// name (`ͼ1`, from StyleModule.newName()) leads with U+037C, which isn't
// ASCII — matching it with `\w` (always ASCII-only in JS, `/u` flag or not)
// silently matches nothing; `.` (any character, same as Gel's own regex)
// is required here instead.
const styleClassToVarName: Record<string, string> = (
  (highlightStyle.module as unknown as {rules: string[]}).rules
).reduce(
  (mapping, rule) => {
    const m = /\.(.*?)\s.*(--syntax-[\w-]+)/.exec(rule);
    if (m) mapping[m[1]] = m[2];
    return mapping;
  },
  {} as Record<string, string>
);

const BASE_VAR = "--syntax-base";

export type ThumbnailData = [number, number, string][][];

// One entry per source line: (startCol, endCol, cssVarName) triples for
// each "word" (whitespace-delimited run) on that line — same word-splitting
// approach as Gel's own addRange, so a single highlighted span covering
// multiple words still renders as separate rects with gaps between them,
// matching how real code looks (not one solid highlighted block).
export function getThumbnailData(query: string): ThumbnailData {
  const tree = pyqlLanguage.parser.parse(query);

  const lines: ThumbnailData = [];
  let currentLine: [number, number, string][] = [];
  let cursor = 0;
  let lineOffset = 0;

  function addRange(from: number, to: number, varName: string) {
    let inWord = query[from] !== " " && query[from] !== "\t";
    let wordStart = from;
    for (let i = from; i < to; i++) {
      switch (query[i]) {
        case "\n":
          if (inWord) {
            currentLine.push([wordStart - lineOffset, i - lineOffset, varName]);
          }
          lines.push(currentLine);
          currentLine = [];
          lineOffset = i + 1;
          addRange(i + 1, to, varName);
          return;
        case " ":
        case "\t":
          if (inWord) {
            currentLine.push([wordStart - lineOffset, i - lineOffset, varName]);
            inWord = false;
          }
          break;
        default:
          if (!inWord) {
            wordStart = i;
            inWord = true;
          }
          break;
      }
    }
    if (inWord) {
      currentLine.push([wordStart - lineOffset, to - lineOffset, varName]);
    }
  }

  highlightTree(tree, highlightStyle, (from, to, classes) => {
    if (from !== cursor) {
      addRange(cursor, from, BASE_VAR);
    }
    addRange(from, to, styleClassToVarName[classes] ?? BASE_VAR);
    cursor = to;
  });

  if (cursor !== query.length) {
    addRange(cursor, query.length, BASE_VAR);
  }

  if (currentLine.length) {
    lines.push(currentLine);
  }

  return lines.slice(0, 16);
}

export function renderThumbnail(data: ThumbnailData) {
  return (
    <svg viewBox="-5 -5 105 70" className="h-full w-full opacity-50 [--syntax-base:#444] dark:[--syntax-base:#e5e5e5]">
      {data.flatMap((line, y) =>
        line.map(([start, end, varName], i) => (
          <rect key={`${y}-${i}`} x={start * 2} y={y * 4} width={(end - start) * 2} height={3} rx={0.75} fill={`var(${varName})`} />
        ))
      )}
    </svg>
  );
}
