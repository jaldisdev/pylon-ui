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

import {EditorView} from "@codemirror/view";
import {HighlightStyle} from "@codemirror/language";
import {tags as t} from "@lezer/highlight";

// A single theme, driven by our --color-*/--syntax-* CSS variables (see
// globals.css), which already flip values under the ".dark" class. No
// separate light/dark EditorView.theme objects needed — only the `dark`
// flag (passed at call time) changes, since it affects a couple of
// CodeMirror's own unstyled defaults.
export const editorTheme = (dark: boolean) =>
  EditorView.theme(
    {
      "&": {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-fg)",
        height: "100%",
      },
      "&.cm-editor.cm-focused": {outline: "none"},
      ".cm-scroller": {
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
        overflow: "auto",
      },
      ".cm-gutters": {
        backgroundColor: "var(--color-surface)",
        color: "var(--color-fg-muted)",
        border: "none",
      },
      ".cm-activeLine": {backgroundColor: "var(--color-surface-hover)"},
      ".cm-activeLineGutter": {backgroundColor: "transparent"},
      ".cm-cursor": {borderLeftColor: "var(--color-accent)"},
      "&.cm-focused .cm-selectionBackground, .cm-selectionBackground": {
        backgroundColor: "var(--color-surface-hover)",
      },
      ".cm-tooltip-autocomplete": {
        backgroundColor: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        overflow: "hidden",
        boxShadow: "var(--shadow-card)",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul": {
        maxHeight: "220px",
        fontFamily: "var(--font-mono)",
        fontSize: "13px",
      },
      ".cm-tooltip.cm-tooltip-autocomplete > ul > li": {
        lineHeight: "28px",
        padding: "0 10px",
      },
      ".cm-tooltip-autocomplete ul li[aria-selected]": {
        backgroundColor: "var(--color-success)",
        color: "var(--color-success-fg)",
      },
      ".cm-completionMatchedText": {
        textDecoration: "none",
        fontWeight: "600",
      },
    },
    {dark}
  );

export const highlightStyle = HighlightStyle.define([
  {tag: t.keyword, color: "var(--syntax-keyword)"},
  {tag: t.string, color: "var(--syntax-string)"},
  {tag: t.comment, color: "var(--syntax-comment)", fontStyle: "italic"},
  {tag: t.standard(t.name), color: "var(--syntax-name)"},
  {tag: t.special(t.name), color: "var(--syntax-name)"},
  {tag: t.operator, color: "var(--syntax-operator)"},
  {tag: t.bool, color: "var(--syntax-number)"},
  {tag: t.number, color: "var(--syntax-number)"},
  {tag: t.special(t.number), color: "var(--syntax-number)"},
  {tag: t.variableName, color: "var(--syntax-name)"},
  {tag: t.escape, color: "var(--syntax-number)"},
]);
