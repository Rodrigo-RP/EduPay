import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SuperAdminDirect() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Configurar datos de super admin directamente
    const superAdminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjUsImVtYWlsIjoic3VwZXJhZG1pbkBlc2N1ZWxhcGF5LmNvbSIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImNhbXB1c19pZCI6MjcsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzUxMDUzMjUwLCJleHAiOjE3NTExMzk2NTB9.WaQR81J10ZpAZXuiYps43i-wzAOkYYcxD3Js4BmH_C4";
    
    const superAdminUser = {
      id: 25,
      email: "superadmin@escuelapay.com",
      role: "super_admin",
      campus_id: 27
    };
    
    // Limpiar localStorage anterior
    localStorage.clear();
    
    // Configurar nueva sesión
    localStorage.setItem("token", superAdminToken);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify(superAdminUser));
    
    // Forzar recarga para aplicar la nueva sesión
    setTimeout(() => {
      window.location.href = "/";
    }, 500);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-red-600 border-t-transparent rounded-full mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-red-500 mb-2">CONFIGURANDO SUPER ADMINISTRADOR</h2>
        <p className="text-gray-400">Accediendo al Centro de Comando Ejecutivo...</p>
      </div>
    </div>
  );
}