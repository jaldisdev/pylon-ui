import type React from "react";
import {useEffect, useMemo, useState} from "react";
import {useMutation} from "@tanstack/react-query";

import {api} from "@/lib/api/client";
import {useSchema} from "@/lib/api/useSchema";
import {useModels} from "@/lib/api/useModels";
import {Card} from "@/ui/Card";
import {ChatPanel, type ChatMessage} from "@/features/ai/ChatPanel";
import {SettingsPanel} from "@/features/ai/SettingsPanel";

// RAG test wizard: pick a chat model + a VectorIndex-bearing type/index +
// an optional Context Query (a PyQL expression narrowing which objects are
// searched — empty means "search every object of the type"), then chat.
// Each message's own text doubles as the vector::search query — no separate
// search-text field (see pylon/server/asgi.py's /api/ai/chat).
export const AiTab: React.FC = () => {
  const {data: schema} = useSchema();
  const {data: modelsData} = useModels();

  const [modelName, setModelName] = useState<string | null>(null);
  const [pylonType, setPylonType] = useState<string | null>(null);
  const [indexName, setIndexName] = useState<string | null>(null);
  const [contextQuery, setContextQuery] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const searchableTypes = useMemo(() => schema?.types.filter((t) => t.vectorIndexes.length > 0) ?? [], [schema]);
  const selectedType = searchableTypes.find((t) => `${t.module}::${t.name}` === pylonType) ?? null;

  // Default to the first available model/type once their data loads — the
  // demo schema only has one searchable type today, so this is usually a
  // no-op UX nicety rather than an arbitrary guess.
  useEffect(() => {
    if (!modelName && modelsData?.models.length) {
      setModelName(modelsData.models[0].name);
    }
  }, [modelsData, modelName]);

  useEffect(() => {
    if (!pylonType && searchableTypes.length > 0) {
      const first = searchableTypes[0];
      setPylonType(`${first.module}::${first.name}`);
      setIndexName(first.vectorIndexes[0]?.indexName ?? null);
    }
  }, [searchableTypes, pylonType]);

  const handleTypeChange = (value: string | null) => {
    setPylonType(value);
    const type = searchableTypes.find((t) => `${t.module}::${t.name}` === value);
    setIndexName(type?.vectorIndexes[0]?.indexName ?? null);
    setContextQuery(""); // a prior type's context query wouldn't apply to the new type
    setMessages([]);
  };

  const canChat = !!modelName && !!pylonType;

  const chatMutation = useMutation({
    mutationFn: (text: string) =>
      api.runAiChat({
        modelName: modelName!,
        pylonType: pylonType!,
        indexName,
        contextQuery: contextQuery.trim() || null,
        message: text,
        history: messages.map(({role, content}) => ({role, content})),
      }),
  });

  const sendMessage = (text: string) => {
    setMessages((prev) => [...prev, {role: "user", content: text}]);
    chatMutation.mutate(text, {
      onSuccess: (res) => {
        setMessages((prev) => [...prev, {role: "assistant", content: res.reply, results: res.results}]);
      },
    });
  };

  // Output — stacked (settings above chat) on mobile; side-by-side (chat
  // left, settings right) on desktop via flex-row-reverse over DOM order.
  return (
    <Card>
      <div className="flex h-full min-h-0 flex-1 flex-col md:flex-row-reverse">
        <SettingsPanel
          searchableTypes={searchableTypes}
          selectedType={selectedType}
          pylonType={pylonType}
          indexName={indexName}
          modelName={modelName}
          contextQuery={contextQuery}
          onTypeChange={handleTypeChange}
          onIndexChange={setIndexName}
          onModelChange={setModelName}
          onContextQueryChange={setContextQuery}
        />
        <ChatPanel messages={messages} canChat={canChat} isSending={chatMutation.isPending} onSend={sendMessage} />
      </div>
    </Card>
  );
};
