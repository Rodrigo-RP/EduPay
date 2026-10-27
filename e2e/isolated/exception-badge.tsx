import React from "react";
import { createRoot } from "react-dom/client";
import { useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "../../client/src/lib/queryClient";
import { AuthProvider, useAuth } from "../../client/src/hooks/use-auth";
import { InstitutionProvider } from "../../client/src/hooks/use-institution";
import Sidebar from "../../client/src/components/layout/sidebar";
import ExcepcionesConciliacion from "../../client/src/pages/excepciones-conciliacion";
import Login from "../../client/src/pages/login";
import { Toaster } from "../../client/src/components/ui/toaster";
import "../../client/src/index.css";

// Real components and production query defaults, served without any backend.
// Every /api request must be intercepted by the spec; no database is connected.
function Scenario() {
  const { user, isLoading } = useAuth();
  const [location] = useLocation();
  if (isLoading) return null;
  if (!user) return <Login />;
  return (
    <InstitutionProvider>
      <Sidebar />
      <main className="ml-64 p-6">
        {location === "/excepciones-conciliacion"
          ? <ExcepcionesConciliacion />
          : <h1>Inicio de prueba</h1>}
      </main>
    </InstitutionProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthProvider><Scenario /><Toaster /></AuthProvider>
  </QueryClientProvider>,
);
