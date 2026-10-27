import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TutoresPanel } from "../../client/src/pages/estudiantes";
import { Toaster } from "../../client/src/components/ui/toaster";
import "../../client/src/index.css";

// Test-only browser harness: never imports the server or connects to a database.
const rows = [
  { id: 2, nombres: "Tutor A", nombre_completo: "Tutor A", es_padre: true,
    es_responsable_pago: false, porcentaje_responsabilidad: "100.00" },
  { id: 3, nombres: "Tutor B", nombre_completo: "Tutor B", es_madre: true,
    es_responsable_pago: true, porcentaje_responsabilidad: "100.00" },
];
const nativeFetch = window.fetch;
window.fetch = async (input, init) => {
  const url = String(input);
  if (url === "/api/admin/students/1/guardians") return Response.json(rows);
  if (url.startsWith("/api/admin/students/1/tutores/") && init?.method === "PUT") {
    const id = Number(url.split("/").at(-1));
    const row = rows.find((item) => item.id === id)!;
    row.es_responsable_pago = JSON.parse(String(init.body)).es_responsable_pago;
    return Response.json(row);
  }
  return nativeFetch(input, init);
};
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Tutores — prueba aislada</h1>
      <TutoresPanel studentId={1} isOpen />
    </main>
    <Toaster />
  </QueryClientProvider>,
);
