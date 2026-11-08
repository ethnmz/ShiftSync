import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { UserProvider } from "./session/user";
// Urbanist (sans) and Geist Mono, bundled locally by Vite from @fontsource
// (no external font requests). Weights 400, 500 and 600 only.
import "@fontsource/urbanist/400.css";
import "@fontsource/urbanist/500.css";
import "@fontsource/urbanist/600.css";
import "@fontsource/geist-mono/400.css";
import "./index.css";
import { Agentation } from "agentation";

// Agentation feedback toolbar: development only. It sends annotations to the
// local agentation MCP server that Claude Code runs on port 4747.
const AGENTATION_ENDPOINT = "http://localhost:4747";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <UserProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </UserProvider>
    </QueryClientProvider>
    {import.meta.env.DEV && <Agentation endpoint={AGENTATION_ENDPOINT} />}
  </React.StrictMode>,
);
