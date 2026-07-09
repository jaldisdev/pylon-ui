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
