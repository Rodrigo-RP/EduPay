import { useAuth } from "@/hooks/use-auth";
import { UserRole } from "@shared/permissions";
import DashboardAdmisiones from "@/pages/dashboard-admisiones";
import DashboardCaja from "@/pages/dashboard-caja";
import DashboardContador from "@/pages/dashboard-contador";
import AdminDashboard from "@/pages/admin-dashboard";

/**
 * Componente que muestra el dashboard apropiado según el rol del usuario
 * Implementa filtrado por roles para mostrar solo información relevante
 */
export default function RoleBasedDashboard() {
  const { user } = useAuth();
  const userRole = (user?.role as UserRole) || 'asistente';

  switch (userRole) {
    case 'super_admin':
    case 'admin':
      return <AdminDashboard />;
    
    case 'admisiones':
      return <DashboardAdmisiones />;
    
    case 'caja':
      return <DashboardCaja />;
    
    case 'contador':
      // Dashboard enfocado en reportes financieros y contables
      return <DashboardContador />;
    
    case 'asistente':
      // Dashboard simplificado con información básica
      return <DashboardAdmisiones />;
    
    default:
      return <AdminDashboard />;
  }
}