import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
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

  // SaaS routing - different interfaces based on user type
  if (guardian) {
    return (
      <Switch>
        <Route path="/" component={ParentPortal} />
        <Route path="/parent" component={ParentPortal} />
        <Route component={NotFound} />
      </Switch>
    );
  }

  return (
    <Switch>
      <Route path="/" component={AdminDashboard} />
      <Route path="/admin" component={AdminDashboard} />
      <Route path="/configuracion-inicial" component={ConfiguracionInicial} />
      <Route path="/emision-cargos" component={EmisionCargos} />
      <Route path="/caja-conciliacion" component={CajaConciliacion} />
      <Route path="/fiscal-contable" component={FiscalContable} />
      <Route path="/portal-3clics" component={PortalPadres3Clics} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <AuthenticatedRoutes />
        </TooltipProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
