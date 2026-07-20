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
