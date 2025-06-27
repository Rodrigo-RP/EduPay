import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";

export default function SwitchToSchool() {
  const { logout } = useAuth();
  
  useEffect(() => {
    // Realizar logout completo primero y luego login como administrador de escuela
    const switchToSchoolAdmin = async () => {
      try {
        // Logout completo para limpiar estado
        logout();
        
        // Esperar un momento para que se limpie el estado
        await new Promise(resolve => setTimeout(resolve, 500));
        
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'admin@sanpatricio.edu.mx',
            password: 'demo123'
          })
        });

        if (response.ok) {
          const data = await response.json();
          
          // Configurar nueva sesión con datos reales del API
          localStorage.setItem("token", data.token);
          localStorage.setItem("auth_type", "user");
          localStorage.setItem("auth_user", JSON.stringify(data.user));
          
          // Forzar recarga completa de la página
          setTimeout(() => {
            window.location.reload();
          }, 500);
        } else {
          console.error('Error en login:', response.statusText);
        }
      } catch (error) {
        console.error('Error de conexión:', error);
      }
    };

    switchToSchoolAdmin();
  }, [logout]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-800">
      <div className="text-center">
        <div className="animate-spin w-12 h-12 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-green-600 mb-2">Cambiando a Administrador de Escuela</h2>
        <p className="text-slate-600">Iniciando sesión en Instituto San Patricio...</p>
      </div>
    </div>
  );
}