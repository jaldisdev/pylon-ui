import type React from "react";
import ReactSelect, {type GroupBase, type Props as ReactSelectProps} from "react-select";
import clsx from "clsx";

export interface SelectOption {
  value: string;
  label: string;
}

type Props = ReactSelectProps<SelectOption, false, GroupBase<SelectOption>>;

// Thin `unstyled` wrapper around react-select — classNames map to our own
// design tokens instead of react-select's default inline-styled look, so it
// matches every other input/dropdown in the app.
export const Select: React.FC<Props> = (props) => (
  <ReactSelect
    unstyled
    menuPlacement="auto"
    isSearchable={false}
    // Portalled to <body> so the menu escapes any scrollable/overflow-hidden
    // ancestor (e.g. the Query Editor's params panel) instead of being
    // clipped by it — z-index alone can't fix that, only escaping the
    // ancestor's overflow box can.
    menuPortalTarget={document.body}
    classNames={{
      control: ({isFocused, isDisabled}) =>
        clsx(
          "flex h-10 items-center rounded-md border bg-surface px-1.5 text-sm",
          isFocused ? "border-accent" : "border-border",
          isDisabled && "opacity-50"
        ),
      placeholder: () => "text-fg-muted",
      singleValue: () => "text-fg",
      input: () => "text-fg",
      indicatorSeparator: () => "hidden",
      dropdownIndicator: () => "text-fg-muted px-1",
      menuPortal: () => "z-50",
      menu: () => "mt-1 rounded-md border border-border bg-surface shadow-[var(--shadow-card)] overflow-hidden",
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
