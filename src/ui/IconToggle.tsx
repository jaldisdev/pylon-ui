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

import clsx from "clsx";
import type {LucideIcon} from "lucide-react";

export interface IconToggleOption<T extends string> {
  key: T;
  icon: LucideIcon;
  label: string;
}

interface IconToggleProps<T extends string> {
  options: IconToggleOption<T>[];
  selected: T;
  onSelect: (key: T) => void;
  className?: string;
}

// Segmented icon-button group, e.g. the Query Editor's split-direction toggle.
// Generic over the option key type so callers get type-safe onSelect values.
export const IconToggle = <T extends string>({
  options,
  selected,
  onSelect,
  className,
}: IconToggleProps<T>) => (
  <div className={clsx("flex items-center gap-0.5 rounded-md border border-border p-0.5", className)}>
    {options.map((option) => (
      <button
        key={option.key}
        type="button"
        title={option.label}
        onClick={() => onSelect(option.key)}
        className={clsx(
          "flex items-center justify-center w-6 h-6 rounded-sm",
          selected === option.key
            ? "bg-surface-hover text-accent"
            : "text-fg-muted hover:text-fg",
          "transition-colors duration-300"
        )}
      >
        <option.icon size={14} strokeWidth={1.75} />
      </button>
    ))}
  </div>
);
