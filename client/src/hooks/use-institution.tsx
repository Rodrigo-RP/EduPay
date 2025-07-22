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
  const [institutionName, setInstitutionName] = useState<string>("Instituto JFR");
  const [campusName, setCampusName] = useState<string>("Campus Principal");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Cargar datos desde localStorage al inicializar
  useEffect(() => {
    const savedInstitutionName = localStorage.getItem('institution_name');
    const savedCampusName = localStorage.getItem('campus_name');
    const savedLogoUrl = localStorage.getItem('institution_logo');

    if (savedInstitutionName) setInstitutionName(savedInstitutionName);
    if (savedCampusName) setCampusName(savedCampusName);
    if (savedLogoUrl) setLogoUrl(savedLogoUrl);
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