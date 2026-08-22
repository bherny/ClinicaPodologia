import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { ErrorBoundary } from "./components/layout/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { DraftProvider } from "./context/DraftContext";
import { queryClient } from "./lib/queryClient";
import { installSoundUnlock } from "./lib/sound";
import "./styles/global.css";
import "./styles/attendance.css";

installSoundUnlock();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <DraftProvider>
          <BrowserRouter>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </BrowserRouter>
        </DraftProvider>
      </AuthProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
