import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SuperAdminDirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Configurar datos de administrador de escuela con token válido
    const schoolAdminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjYsImVtYWlsIjoiYWRtaW5Ac2FucGF0cmljaW8uZWR1Lm14Iiwicm9sZSI6ImFkbWluIiwiY2FtcHVzX2lkIjoyNCwidHlwZSI6InVzZXIiLCJpYXQiOjE3NTEwNTQxOTQsImV4cCI6MTc1MTE0MDU5NH0.sQqrjTkfVcdasAcln0SC-_0rvpz5QLsfFHqrrxTCiy0";
    
    const schoolAdminUser = {
      id: 26,
      email: "admin@sanpatricio.edu.mx",
      role: "admin",
      campus_id: 24
    };
    
    // Limpiar localStorage anterior completamente
    localStorage.clear();
    
    // Configurar nueva sesión de escuela
    localStorage.setItem("token", schoolAdminToken);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify(schoolAdminUser));
    
    // Forzar recarga completa para aplicar la nueva sesión
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-green-600 mb-2">Cambiando a Administrador de Escuela</h2>
        <p className="text-slate-600">Accediendo al Instituto San Patricio...</p>
      </div>
    </div>
  );
}