import { createContext, useContext, useState, ReactNode } from "react";

interface AcademicFilterContextType {
  selectedCiclo: string;
  selectedNivel: string;
  setSelectedCiclo: (ciclo: string) => void;
  setSelectedNivel: (nivel: string) => void;
}

const AcademicFilterContext = createContext<AcademicFilterContextType | undefined>(undefined);

export function AcademicFilterProvider({ children }: { children: ReactNode }) {
  const [selectedCiclo, setSelectedCiclo] = useState("2024-2025");
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