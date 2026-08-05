import { createContext, useContext, useState, ReactNode } from "react";

interface AcademicFilterContextType {
  selectedCiclo: string;
  selectedNivel: string;
  setSelectedCiclo: (ciclo: string) => void;
  setSelectedNivel: (nivel: string) => void;
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

/** Genera la lista de ciclos escolares: 3 anteriores, el actual y el siguiente */
export function generateCiclosList(): string[] {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  const startYear = m >= 8 ? y : y - 1; // año inicio del ciclo actual
  const ciclos: string[] = [];
  for (let yr = startYear + 1; yr >= startYear - 3; yr--) {
    ciclos.push(`${yr}-${yr + 1}`);
  }
  return ciclos;
}

export function AcademicFilterProvider({ children }: { children: ReactNode }) {
  const [selectedCiclo, setSelectedCiclo] = useState(getCurrentCiclo);
  const [selectedNivel, setSelectedNivel] = useState("all");

  return (
    <AcademicFilterContext.Provider 
      value={{
        selectedCiclo,
        selectedNivel,
        setSelectedCiclo,
        setSelectedNivel
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