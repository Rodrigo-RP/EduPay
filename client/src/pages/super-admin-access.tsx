import { useEffect } from "react";
import { useLocation } from "wouter";

export default function SuperAdminAccess() {
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Configurar datos de super admin
    const superAdminToken = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MjUsImVtYWlsIjoic3VwZXJhZG1pbkBlc2N1ZWxhcGF5LmNvbSIsInJvbGUiOiJzdXBlcl9hZG1pbiIsImNhbXB1c19pZCI6MjcsInR5cGUiOiJ1c2VyIiwiaWF0IjoxNzUxMDUzMjUwLCJleHAiOjE3NTExMzk2NTB9.WaQR81J10ZpAZXuiYps43i-wzAOkYYcxD3Js4BmH_C4";
    
    const superAdminUser = {
      id: 25,
      email: "superadmin@escuelapay.com",
      role: "super_admin",
      is_super_admin: true,
      campus_id: 27
    };
    
    // Limpiar sesión anterior
    localStorage.clear();
    
    // Configurar nueva sesión de super admin
    localStorage.setItem("token", superAdminToken);
    localStorage.setItem("auth_type", "user");
    localStorage.setItem("auth_user", JSON.stringify(superAdminUser));
    
    console.log("Super Admin configurado correctamente");
    
    // Forzar recarga de página para que tome la nueva sesión
    window.location.reload();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-slate-900">Configurando Super Administrador</h2>
        <p className="text-slate-600">Redirigiendo al Centro de Comando Ejecutivo...</p>
      </div>
    </div>
  );
}