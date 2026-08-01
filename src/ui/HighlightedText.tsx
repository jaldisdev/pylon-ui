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

interface HighlightedTextProps {
  text: string;
  indices: number[];
}

// Renders `text` with the characters at `indices` highlighted — the matched
// letters in a fuzzy-search result, quick-switcher style.
export const HighlightedText: React.FC<HighlightedTextProps> = ({text, indices}) => {
  const indexSet = new Set(indices);

  // Output
  return (
    <>
      {text.split("").map((char, i) =>
        indexSet.has(i) ? (
          <span key={i} className="rounded-sm bg-accent/25 text-accent">
            {char}
          </span>
        ) : (
          char
        )
      )}
    </>
  );
};
