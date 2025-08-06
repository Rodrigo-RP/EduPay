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

  // Cargar datos desde la base de datos en lugar de localStorage
  useEffect(() => {
    const loadInstitutionalData = async () => {
      try {
        const response = await fetch('/api/institutional-info', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        });
        
        if (response.ok) {
          const data = await response.json();
          setInstitutionName(data.nombre_legal || 'Instituto JFR');
          setCampusName('Campus Principal'); // Esto podría venir de la API campus también
          setLogoUrl(data.logo_url || '/logo-jfr.svg');
        } else {
          // Si no hay datos en BD, usar valores por defecto
          setInstitutionName('Instituto JFR');
          setCampusName('Campus Principal');
          setLogoUrl('/logo-jfr.svg');
        }
      } catch (error) {
        console.error('Error loading institutional data:', error);
        // Fallback a valores por defecto
        setInstitutionName('Instituto JFR');
        setCampusName('Campus Principal');
        setLogoUrl('/logo-jfr.svg');
      }
    };

    loadInstitutionalData();
  }, []);

  // Los datos ahora se guardan automáticamente en la base de datos
  // cuando el usuario hace cambios desde la página de configuración

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