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

  // Migración DEFINITIVA a Instituto JFR - limpiar cualquier referencia a San Patricio
  useEffect(() => {
    // Remover cualquier dato anterior de San Patricio
    if (localStorage.getItem('institution_name') === 'Colegio San Patricio') {
      localStorage.removeItem('institution_name');
    }
    
    // Establecer definitivamente Instituto JFR
    localStorage.setItem('institution_name', 'Instituto JFR');
    localStorage.setItem('campus_name', 'Campus Principal');
    setInstitutionName('Instituto JFR');
    setCampusName('Campus Principal');
    
    console.log('✅ Institución actualizada a: Instituto JFR');
    
    // Cargar logo si existe
    const savedLogoUrl = localStorage.getItem('institution_logo');
    if (savedLogoUrl) setLogoUrl(savedLogoUrl);
  }, []);

  // Re-render forzado cuando cambie el localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const institutionName = localStorage.getItem('institution_name') || 'Instituto JFR';
      const campusName = localStorage.getItem('campus_name') || 'Campus Principal';
      
      if (institutionName !== 'Instituto JFR') {
        localStorage.setItem('institution_name', 'Instituto JFR');
        setInstitutionName('Instituto JFR');
      }
      
      if (campusName !== 'Campus Principal') {
        localStorage.setItem('campus_name', 'Campus Principal');
        setCampusName('Campus Principal');
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
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