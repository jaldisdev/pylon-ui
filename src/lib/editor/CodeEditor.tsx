import type React from "react";
import {useEffect, useImperativeHandle, useLayoutEffect, useRef} from "react";
import clsx from "clsx";
import {EditorState, Compartment, EditorSelection} from "@codemirror/state";
import {EditorView, keymap, drawSelection, placeholder as placeholderExt} from "@codemirror/view";
import {defaultKeymap, history, historyKeymap} from "@codemirror/commands";
import {bracketMatching, syntaxHighlighting, indentOnInput} from "@codemirror/language";
import {closeBrackets, closeBracketsKeymap, autocompletion} from "@codemirror/autocomplete";

import type {SchemaResponse} from "@/lib/api/client";
import {getTypeCompletions} from "@/lib/editor/lang-pyql/completions";
import {pyql, pyqlLanguage} from "@/lib/editor/lang-pyql/pyql";
import {editorTheme, highlightStyle} from "@/lib/editor/theme";

const darkThemeComp = new Compartment();
const autocompleteComp = new Compartment();

export interface CodeEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  clear: () => void;
  focus: () => void;
}

export interface CodeEditorProps {
  defaultValue?: string;
  onChange?: (value: string) => void;
  dark: boolean;
  className?: string;
  placeholder?: string;
  // When provided, offers type-name completions after select/insert/update/
  // delete (see lib/editor/lang-pyql/completions.ts). Omitted entirely
  // (rather than an empty schema) where it doesn't apply, e.g. before the
  // schema has loaded.
  schema?: SchemaResponse;
  // Display-only mode (e.g. the Review Changes modal's generated-PyQL
  // preview) — same syntax highlighting/theme as the interactive editor,
  // just non-editable, no cursor/history/autocomplete.
  readOnly?: boolean;
  ref?: React.Ref<CodeEditorHandle>;
}

// PyQL-aware CodeMirror editor — Phase 1 (REPL only): no schema-aware
// completions, error/warning underlines, or query-plan ("explain")
// decorations yet; those belong to the Query Editor phase, once schema
// data and query diagnostics exist to feed it.
// App-level shortcuts (e.g. "run query") are handled outside via
// react-hotkeys-hook rather than CodeMirror's own keymap — sidesteps CM6's
// keymap precedence rules entirely instead of fighting them.
export const CodeEditor: React.FC<CodeEditorProps> = ({
  defaultValue = "",
  onChange,
  dark,
  className,
  placeholder,
  schema,
  readOnly,
  ref,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const setValue = (value: string) => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({changes: {from: 0, to: view.state.doc.length, insert: value}});
  };

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
    setValue,
    clear: () => setValue(""),
    focus: () => viewRef.current?.focus(),
  }));

  // Mount the editor once; content is uncontrolled after that (callers read
  // the value on demand via the ref instead of re-rendering on every keystroke).
  useEffect(() => {
    if (!containerRef.current) return;

    const view = new EditorView({
      state: EditorState.create({
        doc: defaultValue,
        selection: EditorSelection.cursor(defaultValue.length),
        extensions: [
          history(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion(),
          syntaxHighlighting(highlightStyle),
          pyql(),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...historyKeymap]),
          darkThemeComp.of(editorTheme(dark)),
          autocompleteComp.of(schema ? [pyqlLanguage.data.of({autocomplete: getTypeCompletions(schema)})] : []),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChange?.(update.state.doc.toString());
          }),
          ...(placeholder ? [placeholderExt(placeholder)] : []),
          ...(readOnly ? [EditorState.readOnly.of(true), EditorView.editable.of(false)] : []),
        ],
      }),
      parent: containerRef.current,
    });
    viewRef.current = view;

    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live-swap the theme compartment when the app theme toggles, instead of remounting.
  useLayoutEffect(() => {
    viewRef.current?.dispatch({effects: darkThemeComp.reconfigure(editorTheme(dark))});
  }, [dark]);

  // Re-wire completions once schema loads (it's fetched async, so it's
  // usually still undefined at mount) and whenever it changes thereafter.
  useLayoutEffect(() => {
    viewRef.current?.dispatch({
      effects: autocompleteComp.reconfigure(
        schema ? [pyqlLanguage.data.of({autocomplete: getTypeCompletions(schema)})] : []
      ),
    });
  }, [schema]);

  // overflow-hidden so CodeMirror's own inner background/gutters (which don't
  // know about the wrapper's rounded corners) get clipped to match, instead
  // of visually overflowing past a rounded className.
  // Output
  return <div ref={containerRef} className={clsx("overflow-hidden", className)} />;
};
