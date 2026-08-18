/**
 * OnboardingGuard
 *
 * Wraps the operational admin routes (non-super_admin block).
 * If GET /api/admin/configuracion/onboarding-status returns { completado: false }
 * the user is redirected to /configuracion-inicial so they finish setup first.
 *
 * Excluded from the guard (accessible regardless of onboarding state):
 *   /configuracion-inicial   — the wizard itself (would create infinite redirect)
 *   /perfil / /profile       — user profile (always accessible)
 *   /demo-setup              — demo seeding tool
 *   /migration-refeerence    — reference page
 *
 * super_admin role is exempt entirely (handled in a separate routing block).
 *
 * The guard shows a spinner while the status is being fetched so that the
 * operational pages never render in a partially-configured state.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { useOnboardingStatus } from "@/hooks/use-onboarding";

// Paths that are always accessible regardless of onboarding state.
//
// NOTA: quitar una ruta de aquí solo elimina la barrera del wizard de
// onboarding. El guard de permisos real (SETTINGS.CONFIGURE, etc.) sigue
// aplicando vía el propio componente de la página y los endpoints del backend.
// Agregar una ruta aquí nunca otorga acceso a quien no tenga el permiso.
const UNGUARDED_PATHS = new Set([
  "/configuracion-inicial",
  "/perfil",
  "/profile",
  "/demo-setup",
  "/migration-refeerence",
  // La configuración de Stripe Connect es parte del setup del campus y no
  // debe bloquearse por el wizard de onboarding incompleto. El guard de
  // permisos (SETTINGS.CONFIGURE) sigue activo en el componente y el backend.
  "/configuracion-pagos-completa",
]);

interface OnboardingGuardProps {
  children: React.ReactNode;
}

export default function OnboardingGuard({ children }: OnboardingGuardProps) {
  const [location, navigate] = useLocation();
  const { data, isLoading, isError } = useOnboardingStatus();

  useEffect(() => {
    // If the API returned an error (e.g. 403 for a role without SETTINGS.CONFIGURE)
    // we let the user through — the endpoint guards will handle authorization.
    if (isLoading || isError) return;

    const path = location.split("?")[0]; // strip query string
    if (!data?.completado && !UNGUARDED_PATHS.has(path)) {
      navigate("/configuracion-inicial");
    }
  }, [isLoading, isError, data, location, navigate]);

  // Spinner while we wait for the status check
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px]">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  // If error (e.g. role without SETTINGS.CONFIGURE) render children normally
  if (isError) return <>{children}</>;

  // If completado=false and we are on a guarded path, render nothing while
  // the useEffect fires the redirect (avoids a flash of the protected content)
  const path = location.split("?")[0];
  if (!data?.completado && !UNGUARDED_PATHS.has(path)) {
    return null;
  }

  return <>{children}</>;
}
