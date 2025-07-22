import { useEffect } from "react";

export default function LogoutAndLoginSchool() {
  useEffect(() => {
    const performSwitch = async () => {
      try {
        // Paso 1: Logout completo del backend
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        // Paso 2: Limpiar completamente el localStorage
        localStorage.clear();
        sessionStorage.clear();

        // Paso 3: Login como administrador de escuela
        const loginResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email: 'admin@jfr.edu.mx',
            password: 'demo123'
          })
        });

        if (loginResponse.ok) {
          const loginData = await loginResponse.json();
          
          // Configurar nueva sesión
          localStorage.setItem("token", loginData.token);
          localStorage.setItem("auth_type", "user");
          localStorage.setItem("auth_user", JSON.stringify(loginData.user));
          
          // Recargar página completamente
          window.location.href = "/";
        } else {
          console.error('Error en login de escuela');
          alert('Error al cambiar a perfil de escuela');
        }
      } catch (error) {
        console.error('Error en cambio de perfil:', error);
        alert('Error de conexión al cambiar perfil');
      }
    };

    performSwitch();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="animate-spin w-16 h-16 border-4 border-green-600 border-t-transparent rounded-full mx-auto mb-6" />
        <h2 className="text-3xl font-bold text-green-600 mb-4">Cambiando Perfil</h2>
        <p className="text-slate-600 text-lg">Cerrando sesión de Super Administrador...</p>
        <p className="text-slate-500 mt-2">Iniciando sesión como Administrador de Escuela...</p>
      </div>
    </div>
  );
}