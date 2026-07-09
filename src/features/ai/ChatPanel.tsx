import type React from "react";
import {useState} from "react";
import clsx from "clsx";
import {Send} from "lucide-react";

import type {AiChatResult} from "@/lib/api/client";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  results?: AiChatResult[];
}

interface ChatPanelProps {
  messages: ChatMessage[];
  canChat: boolean;
  isSending: boolean;
  onSend: (text: string) => void;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({messages, canChat, isSending, onSend}) => {
  const [draft, setDraft] = useState("");

  const sendMessage = () => {
    const text = draft.trim();
    if (!text || !canChat || isSending) return;
    onSend(text);
    setDraft("");
  };

  // Output
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex-1 overflow-y-auto p-4">
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
          {messages.length === 0 && (
            <div className="flex h-full min-h-40 items-center justify-center text-sm text-fg-muted">
              {canChat ? "Ask a question about the search results" : "Select a type and enter a search to start"}
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={clsx("flex", m.role === "user" ? "justify-end" : "justify-start")}>
              <div
                className={clsx(
                  "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "user" ? "bg-accent text-accent-fg" : "bg-surface-active text-fg"
                )}
              >
                {m.content}
                {/* Kept deliberately understated — the answer is the point, sources are a footnote. */}
                {m.results && m.results.length > 0 && (
                  <div className="mt-1 text-xs text-fg-muted opacity-70">{m.results.length} source(s)</div>
                )}
              </div>
            </div>
          ))}
          {isSending && <div className="text-sm text-fg-muted">Thinking…</div>}
        </div>
      </div>
      <div className="shrink-0 border-t border-border p-3">
        <div className="mx-auto flex w-full max-w-4xl items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            disabled={!canChat}
            rows={1}
            placeholder={canChat ? "Ask a question…" : "Select a type and enter a search to start"}
            className="flex-1 resize-none rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm text-fg placeholder:text-fg-muted focus:border-accent focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!canChat || !draft.trim() || isSending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-accent-fg disabled:opacity-40"
          >
            <Send size={14} strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
};
