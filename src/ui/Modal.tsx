import type React from "react";
import {useEffect} from "react";
import {X} from "lucide-react";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  // "md" (default): fixed width, for short-form content (e.g. Session
  // Globals). "lg": grows to fit wide content (e.g. generated PyQL code in
  // the Review Changes modal) up to a viewport-relative cap, rather than
  // wrapping/clipping it at a narrow fixed width.
  size?: "md" | "lg";
}

const SIZE_CLASSES: Record<NonNullable<ModalProps["size"]>, string> = {
  md: "w-full max-w-md",
  lg: "w-fit min-w-[28rem] max-w-[min(92vw,56rem)]",
};

// Generic centered modal with a backdrop — Escape and backdrop-click both
// close it; clicks inside the panel itself don't propagate to the backdrop.
export const Modal: React.FC<ModalProps> = ({title, onClose, children, size = "md"}) => {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Output
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className={`flex max-h-[80vh] flex-col overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-card)] ${SIZE_CLASSES[size]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-border bg-header px-4">
          <span className="text-sm font-medium text-fg">{title}</span>
          <button
            type="button"
            onClick={onClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-fg-muted hover:bg-surface-hover hover:text-fg"
          >
            <X size={16} strokeWidth={1.75} />
          </button>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
};
