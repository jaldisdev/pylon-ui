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

import {defineConfig, loadEnv} from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import tailwindcss from "@tailwindcss/vite";
import {fileURLToPath, URL} from "node:url";

// Vite config: React + Tailwind v4, "@/" alias for src/, and an /api proxy
// to a locally running "pylon serve" process during development. The proxy
// target is configurable via PYLON_SERVE_URL (.env / .env.local), so pointing
// the UI at a different host:port doesn't require editing this file.
export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), "");
  const apiTarget = env.PYLON_SERVE_URL || "http://localhost:5656";

  return {
    // exportType: "default" — a plain `import Logo from "./logo.svg"` gives
    // the React component directly, no `?react` suffix or named import needed.
    plugins: [react(), svgr({svgrOptions: {exportType: "default"}}), tailwindcss()],
    resolve: {
      alias: {
        "@": fileURLToPath(new URL("./src", import.meta.url)),
      },
    },
    define: {
      'APP_VERSION': JSON.stringify(process.env.npm_package_version),
    },
    server: {
      port: 8080,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
      },
    },
  };
});
