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
import {Switch as RadixSwitch} from "radix-ui";
import clsx from "clsx";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  title?: string;
  disabled?: boolean;
}

// Small on/off toggle (per-global activation) — a thin styled wrapper
// around radix-ui's Switch primitive, matching the app's accent color.
export const Switch: React.FC<SwitchProps> = ({checked, onCheckedChange, title, disabled}) => (
  <RadixSwitch.Root
    checked={checked}
    onCheckedChange={onCheckedChange}
    title={title}
    disabled={disabled}
    className={clsx(
      "relative h-4 w-7 shrink-0 rounded-full outline-none transition-colors duration-200",
      checked ? "bg-accent" : "bg-surface-active",
      disabled && "opacity-50"
    )}
  >
    <RadixSwitch.Thumb
      className={clsx(
        "block h-3 w-3 translate-x-0.5 rounded-full bg-white shadow transition-transform duration-200 will-change-transform",
        checked && "translate-x-3.5"
      )}
    />
  </RadixSwitch.Root>
);
