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
import {useEffect, useRef, useState} from "react";
import clsx from "clsx";

interface ConfirmButtonProps {
  label: string;
  confirmLabel?: string;
  onConfirm: () => void;
  className?: string;
  // How long the armed state lasts before silently reverting if the second
  // click never comes.
  armedMs?: number;
}

// A first click "arms" the button (label swaps to a confirmation prompt, a
// few seconds to change your mind); a second click within that window
// actually fires. Used by the Review Changes modal's "Clear all changes" —
// a lighter-weight guard than a separate confirm dialog for an action
// that's still fully reversible up until it fires (discarding in-memory
// pending edits, not a server call).
export const ConfirmButton: React.FC<ConfirmButtonProps> = ({
  label,
  confirmLabel = "Click again to confirm",
  onConfirm,
  className,
  armedMs = 3000,
}) => {
  const [armed, setArmed] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  const onClick = () => {
    if (armed) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timeoutRef.current = setTimeout(() => setArmed(false), armedMs);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx("text-sm", armed ? "font-medium text-red-500" : "text-fg-muted hover:text-fg", className)}
    >
      {armed ? confirmLabel : label}
    </button>
  );
};
