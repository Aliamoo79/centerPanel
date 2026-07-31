import React, { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import ErrorBoundary from "./components/ErrorBoundary";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Servers from "./pages/Servers";
import Users from "./pages/Users";
import UserDetail from "./pages/UserDetail";
import Logs from "./pages/Logs";
import { getToken } from "./lib/api";
import { useToast } from "./lib/toast";

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

// Catches promise rejections that slip past a page's own try/catch (e.g. a
// stray .then() with no .catch()) so a failure is always visible instead of
// silently vanishing into the browser console.
function GlobalErrorCatcher() {
  const toast = useToast();
  useEffect(() => {
    const handler = (e: PromiseRejectionEvent) => {
      const message = e.reason?.message ?? "یک خطای غیرمنتظره رخ داد";
      toast.error(message);
      // eslint-disable-next-line no-console
      console.error("Unhandled rejection:", e.reason);
    };
    window.addEventListener("unhandledrejection", handler);
    return () => window.removeEventListener("unhandledrejection", handler);
  }, [toast]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <GlobalErrorCatcher />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Overview /></RequireAuth>} />
        <Route path="/servers" element={<RequireAuth><Servers /></RequireAuth>} />
        <Route path="/users" element={<RequireAuth><Users /></RequireAuth>} />
        <Route path="/users/:id" element={<RequireAuth><UserDetail /></RequireAuth>} />
        <Route path="/logs" element={<RequireAuth><Logs /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
