import type React from "react";
import {QueryClientProvider} from "@tanstack/react-query";
import {Navigate, Route, BrowserRouter, Routes} from "react-router-dom";

import {AiTab} from "@/features/ai/AiTab";
import {DataExplorerTab} from "@/features/dataExplorer/DataExplorerTab";
import {QueryEditorTab} from "@/features/queryEditor/QueryEditorTab";
import {ReplTab} from "@/features/repl/ReplTab";
import {queryClient} from "@/lib/api/queryClient";
import {ThemeProvider} from "@/lib/theme/useTheme";

import {Layout} from "./Layout";

// Root component: wires up global providers (data fetching, theme) and the
// route table. Every tab lives under /:branch/<tab>, defaulting to /main/repl.
const App: React.FC = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/main/repl" replace />} />
          <Route path=":branch" element={<Layout />}>
            <Route index element={<Navigate to="repl" replace />} />
            <Route path="repl" element={<ReplTab />} />
            <Route path="query" element={<QueryEditorTab />} />
            <Route path="data" element={<DataExplorerTab />} />
            <Route path="ai" element={<AiTab />} />
          </Route>
          <Route path="*" element={<Navigate to="/main/repl" replace />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
