import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AcademicFilterProvider, generateCiclosList, useAcademicFilter } from "../../client/src/hooks/use-academic-filter";
import Estudiantes from "../../client/src/pages/estudiantes";
import Familias from "../../client/src/pages/familias";
import "../../client/src/index.css";

// Sólo UI aislada: las peticiones /api se interceptan en el navegador de prueba.
function Harness() {
  const { selectedCiclo, selectedNivel, setSelectedCiclo, setSelectedNivel } = useAcademicFilter();
  const [pagina, setPagina] = useState("inicio");
  return <>
    <nav>
      <label>Ciclo compartido
        <select value={selectedCiclo} onChange={e => setSelectedCiclo(e.target.value)}>
          <option value="all">Todos</option>
          {generateCiclosList().map(ciclo => <option key={ciclo}>{ciclo}</option>)}
        </select>
      </label>
      <label>Nivel compartido
        <select value={selectedNivel} onChange={e => setSelectedNivel(e.target.value)}>
          {["all", "KINDER", "PRIMARIA", "SECUNDARIA", "BACHILLERATO"].map(nivel =>
            <option key={nivel}>{nivel}</option>)}
        </select>
      </label>
      {["inicio", "alumnos", "familias"].map(pagina =>
        <button key={pagina} onClick={() => setPagina(pagina)}>{pagina}</button>)}
    </nav>
    <main>{pagina === "alumnos" ? <Estudiantes /> : pagina === "familias" ? <Familias /> : null}</main>
  </>;
}

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <AcademicFilterProvider><Harness /></AcademicFilterProvider>
  </QueryClientProvider>,
);
