import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./app/App";
import "./styles.css";

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 2_000, retry: 1, refetchOnWindowFocus: false } } });
const root = document.getElementById("root");
if (!root) throw new Error("QB Trace application root is missing");
ReactDOM.createRoot(root).render(<React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>);
