import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { AcademicFilterProvider } from "@/hooks/use-academic-filter";
import { InstitutionProvider } from "@/hooks/use-institution";
import { RealTimeProvider } from "@/components/RealTimeProvider";
import { GraduationCap } from "lucide-react";
import Header from "@/components/layout/header";
import Sidebar from "@/components/layout/sidebar";
import ParentPortal from "@/pages/parent-portal";
import AdminDashboard from "@/pages/admin-dashboard";
import Login from "@/pages/login";
import Checkout from "@/pages/checkout";
import NotFound from "@/pages/not-found";
import ConfiguracionInicial from "@/pages/configuracion-inicial";
import EmisionCargos from "@/pages/emision-cargos";
import PortalPadres3Clics from "@/pages/portal-padres-3clics";
import CajaConciliacion from "@/pages/caja-conciliacion";
import FiscalContable from "@/pages/fiscal-contable";
import Estudiantes from "@/pages/estudiantes";
import Familias from "@/pages/familias";
import UsuariosUnificado from "@/pages/usuarios-unificado";
import Cargos from "@/pages/cargos";
import Pagos from "@/pages/pagos";
import CuentasPorCobrar from "@/pages/cuentas-por-cobrar";
import CuentasPorCobrarStandalone from "@/pages/cuentas-por-cobrar-standalone";
import CatalogoProductos from "@/pages/catalogo-productos";
import Becas from "@/pages/becas";
import Notificaciones from "@/pages/notificaciones";
import Reportes from "@/pages/reportes";
import Configuracion from "@/pages/configuracion";
import AsignacionPrecios from "@/pages/asignacion-precios";
import ImportacionDatos from "@/pages/importacion-datos";

import ConfiguracionPagos from "@/pages/configuracion-pagos";
import ConfiguracionPagosNuevo from "@/pages/configuracion-pagos-nuevo";
import Aprobaciones from "@/pages/aprobaciones";
import DemoAprobaciones from "@/pages/demo-aprobaciones";
import DashboardAdmisiones from "@/pages/dashboard-admisiones";
import DashboardCaja from "@/pages/dashboard-caja";
import ReportesFinancieros from "@/pages/reportes-financieros";
import ReportesAdmisiones from "@/pages/reportes-admisiones";
import RoleBasedDashboard from "@/components/RoleBasedDashboard";
import Profile from "@/pages/profile";
import MigrationRefeerence from "@/pages/migration-refeerence";

function AuthenticatedRoutes() {
  const { user, guardian, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user && !guardian) {
    return <Login />;
  }

  // Redirect guardians to mobile app notice (should not happen in SaaS version)
  if (guardian) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <GraduationCap className="w-8 h-8 text-blue-600" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Aplicación Móvil Requerida</h1>
          <p className="text-slate-600 mb-6">
            Los padres de familia deben utilizar la aplicación móvil dedicada de Edupay para acceder a sus servicios.
          </p>
          <Button onClick={() => window.location.href = "/"} variant="outline">
            Ir al Portal Administrativo
          </Button>
        </div>
      </div>
    );
  }

  // Super Admin routing - redirect to dashboard
  if (user && user.role === 'super_admin') {
    return (
      <Switch>
        <Route path="/" component={AdminDashboard} />
        <Route path="/admin" component={AdminDashboard} />
        <Route component={AdminDashboard} />
      </Switch>
    );
  }

  // Admin/staff routes with role-based dashboard redirection
  const getRoleBasedDashboard = () => {
    return RoleBasedDashboard;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <Sidebar />
      <div className="flex-1 flex flex-col">
        <Header />
        <main className="flex-1 p-6 bg-slate-50">
          <Switch>
            <Route path="/" component={getRoleBasedDashboard()} />
            <Route path="/admin" component={AdminDashboard} />
            <Route path="/dashboard-admisiones" component={DashboardAdmisiones} />
            <Route path="/dashboard-caja" component={DashboardCaja} />
            <Route path="/estudiantes" component={Estudiantes} />
            <Route path="/familias" component={Familias} />
            <Route path="/usuarios" component={UsuariosUnificado} />
            <Route path="/cargos" component={Cargos} />
            <Route path="/pagos" component={Pagos} />
            <Route path="/cuentas-por-cobrar" component={CuentasPorCobrar} />
            <Route path="/cuentas-standalone" component={CuentasPorCobrarStandalone} />
            <Route path="/catalogo-productos" component={CatalogoProductos} />
            <Route path="/becas" component={Becas} />
            <Route path="/notificaciones" component={Notificaciones} />
            <Route path="/reportes" component={Reportes} />
            <Route path="/configuracion" component={Configuracion} />
            <Route path="/configuracion-inicial" component={ConfiguracionInicial} />
            <Route path="/configuracion-pagos" component={ConfiguracionPagosNuevo} />
            <Route path="/configuracion-pagos-nuevo" component={ConfiguracionPagosNuevo} />
            <Route path="/emision-cargos" component={EmisionCargos} />
            <Route path="/asignacion-precios" component={AsignacionPrecios} />
            <Route path="/importacion-datos" component={ImportacionDatos} />
            <Route path="/caja-conciliacion" component={CajaConciliacion} />
            <Route path="/fiscal-contable" component={FiscalContable} />
            <Route path="/reportes-financieros" component={ReportesFinancieros} />
            <Route path="/reportes-admisiones" component={ReportesAdmisiones} />
            <Route path="/portal-3clics" component={PortalPadres3Clics} />
            <Route path="/aprobaciones" component={Aprobaciones} />
            <Route path="/demo-aprobaciones" component={DemoAprobaciones} />
            <Route path="/dashboard-admisiones" component={DashboardAdmisiones} />
            <Route path="/dashboard-caja" component={DashboardCaja} />
            <Route path="/migration-refeerence" component={MigrationRefeerence} />
            <Route path="/profile" component={Profile} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <InstitutionProvider>
          <AcademicFilterProvider>
            <RealTimeProvider>
              <TooltipProvider>
                <div className="min-h-screen bg-slate-50">
                  <Switch>
                    <Route path="/cuentas-standalone" component={CuentasPorCobrarStandalone} />
                    <Route component={AuthenticatedRoutes} />
                  </Switch>
                  <Toaster />
                </div>
              </TooltipProvider>
            </RealTimeProvider>
          </AcademicFilterProvider>
        </InstitutionProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
