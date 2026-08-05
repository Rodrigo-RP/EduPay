import { createContext, useContext, useState, ReactNode } from "react";

interface AcademicFilterContextType {
  selectedCiclo: string;
  selectedNivel: string;
  selectedPeriodo: string;
  setSelectedCiclo: (ciclo: string) => void;
  setSelectedNivel: (nivel: string) => void;
  setSelectedPeriodo: (periodo: string) => void;
}

const AcademicFilterContext = createContext<AcademicFilterContextType | undefined>(undefined);

/** Calcula el ciclo escolar activo según la fecha actual.
 *  Agosto o después → año/año+1; antes de agosto → año-1/año */
export function getCurrentCiclo(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1; // 1-12
  return m >= 8 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/** Genera la lista de ciclos escolares relevantes para producción:
 *  el siguiente (planeación), el actual y el anterior (migración de datos). */
export function generateCiclosList(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 8 ? y : y - 1; // año inicio del ciclo actual
  return [
    `${startYear + 1}-${startYear + 2}`, // siguiente
    `${startYear}-${startYear + 1}`,     // actual
    `${startYear - 1}-${startYear}`,     // anterior (migración)
  ];
}

export function AcademicFilterProvider({ children }: { children: ReactNode }) {
  const [selectedCiclo, setSelectedCiclo]   = useState(getCurrentCiclo);
  const [selectedNivel, setSelectedNivel]   = useState("all");
  const [selectedPeriodo, setSelectedPeriodo] = useState("mes"); // hoy | semana | mes | ciclo

  return (
    <AcademicFilterContext.Provider 
      value={{
        selectedCiclo,
        selectedNivel,
        selectedPeriodo,
        setSelectedCiclo,
        setSelectedNivel,
        setSelectedPeriodo,
      }}
    >
      {children}
    </AcademicFilterContext.Provider>
  );
}

export function useAcademicFilter() {
  const context = useContext(AcademicFilterContext);
  if (context === undefined) {
    throw new Error('useAcademicFilter must be used within an AcademicFilterProvider');
  }
  return context;
}