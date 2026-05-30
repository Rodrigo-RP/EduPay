import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

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

  // Cargar datos institucionales usando React Query
  const { data: institutionalData } = useQuery({
    queryKey: ['/api/institutional-info'],
    queryFn: async () => {
      const response = await apiRequest('/api/institutional-info');
      return response.json();
    },
    retry: 1,
    staleTime: 0, // Siempre refrescar datos
    gcTime: 0, // No mantener cache
    enabled: !!localStorage.getItem('auth_token') // Solo ejecutar si hay token
  });

  // Actualizar estado cuando se cargan los datos
  useEffect(() => {
    if (institutionalData && Object.keys(institutionalData).length > 0) {
      setInstitutionName(institutionalData.nombre_legal || 'Instituto JFR');
      setCampusName('Campus Principal');
      
      if (institutionalData.logo_url && institutionalData.logo_url.trim() !== '') {
        // Decodificar HTML entities si están presentes
        const decodedUrl = institutionalData.logo_url
          .replace(/&#x2F;/g, '/')
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&');
        console.log('🖼️ Logo URL procesada, longitud:', decodedUrl.length);
        setLogoUrl(decodedUrl);
      } else {
        setLogoUrl(null);
      }
    } else {
      // Valores por defecto
      setInstitutionName('Instituto JFR');
      setCampusName('Campus Principal');
      setLogoUrl(null);
    }
  }, [institutionalData]);

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