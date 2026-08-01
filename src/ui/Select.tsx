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
import ReactSelect, {type GroupBase, type Props as ReactSelectProps} from "react-select";
import clsx from "clsx";

export interface SelectOption {
  value: string;
  label: string;
}

type Props = ReactSelectProps<SelectOption, false, GroupBase<SelectOption>> & {
  // Grid-cell usage (DataEditorCell's EnumEditor) — fills the cell's full
  // height flush against its edges, matching ScalarMemberInput's own `dense`
  // styling, instead of the roomier fixed h-10/rounded-md control every
  // other Select caller (GlobalsModal, ParamsPanel, ...) wants.
  dense?: boolean;
};

// Thin `unstyled` wrapper around react-select — classNames map to our own
// design tokens instead of react-select's default inline-styled look, so it
// matches every other input/dropdown in the app.
export const Select: React.FC<Props> = ({dense, ...props}) => (
  <ReactSelect
    unstyled
    menuPlacement="auto"
    isSearchable={false}
    // Portalled to <body> so the menu escapes any scrollable/overflow-hidden
    // ancestor (e.g. the Query Editor's params panel) instead of being
    // clipped by it — z-index alone can't fix that, only escaping the
    // ancestor's overflow box can.
    menuPortalTarget={document.body}
    // `unstyled` only strips react-select's default *visual* styling
    // (colors/padding/etc, driven by classNames below) — it still computes
    // its own inline `style` for the portal wrapper (position/top/left plus
    // a baked-in `zIndex: 1`), and an inline style always wins over a class
    // regardless of specificity or source order. A `menuPortal` className
    // alone (e.g. a z-60 Tailwind utility) can therefore never lift the menu
    // above Modal.tsx's z-50 backdrop — only overriding the style object
    // itself does.
    styles={{menuPortal: (base) => ({...base, zIndex: 60})}}
    classNames={{
      // `control`'s own h-full needs a definite (non-auto) height to resolve
      // against — react-select's outer container div doesn't have one by
      // default, so dense mode gives it one too.
      container: () => clsx(dense && "h-full"),
      control: ({isFocused, isDisabled}) =>
        clsx(
          "flex items-center border bg-surface",
          dense ? "h-full rounded-none px-2 text-2sm" : "h-10 rounded-md px-1.5 text-sm",
          isFocused ? "border-accent" : "border-border",
          isDisabled && "opacity-50"
        ),
      placeholder: () => "text-fg-muted",
      singleValue: () => "text-fg",
      input: () => "text-fg",
      indicatorSeparator: () => "hidden",
      dropdownIndicator: () => "text-fg-muted px-1",
      menu: () => "mt-1 rounded-md border border-border bg-surface shadow-(--shadow-card) overflow-hidden",
      menuList: () => "p-1 max-h-60",
      option: ({isFocused, isSelected}) =>
        clsx(
          "cursor-pointer rounded px-2 py-1.5 text-sm",
          isSelected ? "bg-accent text-accent-fg" : isFocused ? "bg-surface-hover text-fg" : "text-fg"
        ),
      noOptionsMessage: () => "px-2 py-1.5 text-sm text-fg-muted",
    }}
    {...props}
  />
);
