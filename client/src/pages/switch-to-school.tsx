import { useEffect } from "react";

export default function SwitchToSchool() {
  useEffect(() => {
    // Realizar login programático como administrador de escuela
    const loginAsSchoolAdmin = async () => {
      try {
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
          
          // Limpiar localStorage completamente
          localStorage.clear();
          
          // Configurar nueva sesión con datos reales del API
          localStorage.setItem("token", data.token);
          localStorage.setItem("auth_type", "user");
          localStorage.setItem("auth_user", JSON.stringify(data.user));
          
          // Redirigir al dashboard de la escuela
          setTimeout(() => {
            window.location.href = "/";
          }, 1000);
        } else {
          console.error('Error en login:', response.statusText);
        }
      } catch (error) {
        console.error('Error de conexión:', error);
      }
    };

    loginAsSchoolAdmin();
  }, []);

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