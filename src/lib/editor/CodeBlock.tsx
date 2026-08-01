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

import type React from "react";
import {Fragment} from "react";
import {StyleModule} from "style-mod";

import type {Language} from "@codemirror/language";
import {highlightTree} from "@lezer/highlight";

import {pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {highlightStyle} from "@/lib/editor/theme";

// Mount the syntax-highlighting classes once. Normally CodeMirror's own
// `syntaxHighlighting(highlightStyle)` extension does this as a side effect
// of building an EditorView; this component bypasses EditorView entirely
// (it's a plain read-only syntax-highlighted string, not an editor), so the
// stylesheet needs mounting directly instead.
if (highlightStyle.module) {
  StyleModule.mount(document, highlightStyle.module);
}

export type Range = [number, number];

export type CustomRange = {range: Range} & (
  | {style?: string}
  | {renderer: (range: Range, content: React.ReactElement<{children?: React.ReactNode}>) => React.ReactElement}
);

export interface CodeBlockProps {
  code: string;
  language?: Language;
  customRanges?: CustomRange[] | ((tree: ReturnType<Language["parser"]["parse"]>) => CustomRange[]);
  inline?: boolean;
  className?: string;
}

// Renders `code` with real PyQL syntax highlighting, no CodeMirror EditorView
// involved — just a Lezer parse + highlightTree walk producing styled spans.
// `customRanges` lets a caller splice a decoration (or a fully custom
// renderer) over an arbitrary byte range of the source, e.g. the Review
// Changes modal replacing each `$paramName` reference with its resolved
// value.
export const CodeBlock: React.FC<CodeBlockProps> = ({code, language, customRanges, inline, className}) => {
  const tree = (language ?? pyqlLanguage).parser.parse(code);

  const html: (string | React.ReactElement)[] = [];

  const ranges = Array.isArray(customRanges) ? customRanges : customRanges?.(tree);

  let nextRangeIndex = 0;
  let currentRange = ranges?.[nextRangeIndex++];

  let customRangeBuffer: (string | React.ReactElement)[] | null = null;

  let cursor = 0;
  function addSpan(text: string, spanClassName?: string): void {
    if (!customRangeBuffer && currentRange && currentRange.range[0] >= cursor && currentRange.range[0] <= cursor + text.length) {
      if (currentRange.range[0] !== cursor) {
        const textSlice = text.slice(0, currentRange.range[0] - cursor);
        html.push(
          spanClassName ? (
            <span key={html.length} className={spanClassName}>
              {textSlice}
            </span>
          ) : (
            textSlice
          )
        );
        text = text.slice(currentRange.range[0] - cursor);
      }
      cursor = currentRange.range[0];
      customRangeBuffer = [];
    }
    if (customRangeBuffer) {
      if (currentRange!.range[1] <= cursor + text.length) {
        const textSlice = text.slice(0, currentRange!.range[1] - cursor);
        customRangeBuffer.push(
          spanClassName ? (
            <span key={customRangeBuffer.length} className={spanClassName}>
              {textSlice}
            </span>
          ) : (
            textSlice
          )
        );

        html.push(
          "renderer" in currentRange! ? (
            <Fragment key={html.length}>{currentRange!.renderer(currentRange!.range, <>{customRangeBuffer}</>)}</Fragment>
          ) : (
            <span key={html.length} className={currentRange!.style}>
              {customRangeBuffer}
            </span>
          )
        );

        customRangeBuffer = null;
        cursor = currentRange!.range[1];
        currentRange = ranges?.[nextRangeIndex++];
        return addSpan(text.slice(textSlice.length), spanClassName);
      } else {
        customRangeBuffer.push(
          spanClassName ? (
            <span key={customRangeBuffer.length} className={spanClassName}>
              {text}
            </span>
          ) : (
            text
          )
        );
        cursor += text.length;
        return;
      }
    }
    html.push(
      spanClassName ? (
        <span key={html.length} className={spanClassName}>
          {text}
        </span>
      ) : (
        text
      )
    );
    cursor += text.length;
  }

  highlightTree(tree, highlightStyle, (from, to, classes) => {
    if (cursor !== from) addSpan(code.slice(cursor, from));
    addSpan(code.slice(from, to), classes);
  });
  addSpan(code.slice(cursor));

  if (currentRange && customRangeBuffer) {
    html.push(
      "renderer" in currentRange ? (
        <Fragment key={html.length}>{currentRange.renderer(currentRange.range, <>{customRangeBuffer}</>)}</Fragment>
      ) : (
        <span key={html.length} className={currentRange.style}>
          {customRangeBuffer}
        </span>
      )
    );
  }

  return inline ? <span className={className}>{html}</span> : <pre className={className}>{html}</pre>;
};
