import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface InstitutionContextType {
  institutionName: string;
  campusName: string;
  logoUrl: string | null;
  setInstitutionName: (name: string) => void;
  setCampusName: (name: string) => void;
  setLogoUrl: (url: string | null) => void;
}

const InstitutionContext = createContext<InstitutionContextType | undefined>(undefined);

export function InstitutionProvider({ children }: { children: ReactNode }) {
  // FORZAR HARDCODED - NO USAR LOCALSTORAGE TEMPORAL
  const [institutionName, setInstitutionName] = useState<string>("Instituto JFR");
  const [campusName, setCampusName] = useState<string>("Campus Principal");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // SOLUCIÓN TEMPORAL HARDCODED - Ignorar localStorage completamente
  useEffect(() => {
    // Limpiar localStorage completamente
    localStorage.clear();
    // Forzar valores hardcodeados
    setInstitutionName('Instituto JFR');
    setCampusName('Campus Principal');
    console.log('🔧 HARDCODED: Instituto JFR forzado');
  }, []);

  // Guardar en localStorage cuando cambien los valores
  useEffect(() => {
    localStorage.setItem('institution_name', institutionName);
  }, [institutionName]);

  useEffect(() => {
    localStorage.setItem('campus_name', campusName);
  }, [campusName]);

  useEffect(() => {
    if (logoUrl) {
      localStorage.setItem('institution_logo', logoUrl);
    } else {
      localStorage.removeItem('institution_logo');
    }
  }, [logoUrl]);

  return (
    <InstitutionContext.Provider value={{
      institutionName,
      campusName,
      logoUrl,
      setInstitutionName,
      setCampusName,
      setLogoUrl
    }}>
      {children}
    </InstitutionContext.Provider>
  );
}

export function useInstitution() {
  const context = useContext(InstitutionContext);
  if (context === undefined) {
    throw new Error('useInstitution must be used within an InstitutionProvider');
  }
  return context;
}