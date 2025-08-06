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
    enabled: !!localStorage.getItem('auth_token') // Solo ejecutar si hay token
  });

  // Actualizar estado cuando se cargan los datos
  useEffect(() => {
    console.log('🔍 Datos institucionales recibidos:', institutionalData);
    if (institutionalData && Object.keys(institutionalData).length > 0) {
      setInstitutionName(institutionalData.nombre_legal || 'Instituto JFR');
      setCampusName('Campus Principal');
      
      // Log específico para logo
      console.log('🖼️ Logo URL de la base de datos:', institutionalData.logo_url);
      
      if (institutionalData.logo_url && institutionalData.logo_url.trim() !== '') {
        setLogoUrl(institutionalData.logo_url);
        console.log('✅ Logo cargado desde BD:', institutionalData.logo_url.substring(0, 50) + '...');
      } else {
        setLogoUrl('/logo-jfr.svg');
        console.log('⚠️ No hay logo en BD, usando logo por defecto');
      }
    } else {
      // Valores por defecto
      setInstitutionName('Instituto JFR');
      setCampusName('Campus Principal');
      setLogoUrl('/logo-jfr.svg');
      console.log('🏠 Usando valores por defecto');
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