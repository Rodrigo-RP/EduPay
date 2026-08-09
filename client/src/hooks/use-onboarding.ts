/**
 * Hook: useOnboardingStatus
 *
 * Fetches onboarding_completado from campuses via
 * GET /api/admin/configuracion/onboarding-status.
 *
 * Used by:
 *  - OnboardingGuard in App.tsx  (blocks operational screens until completado=true)
 *  - configuracion-inicial.tsx   (initialises wizard step from persisted state)
 */
import { useQuery } from "@tanstack/react-query";

interface OnboardingStatus {
  completado: boolean;
  campus_id: number;
}

async function fetchOnboardingStatus(): Promise<OnboardingStatus> {
  const token = localStorage.getItem("auth_token");
  const res = await fetch("/api/admin/configuracion/onboarding-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("onboarding-status fetch failed");
  return res.json();
}

export function useOnboardingStatus() {
  return useQuery<OnboardingStatus>({
    queryKey: ["onboarding-status"],
    queryFn: fetchOnboardingStatus,
    staleTime: 30_000,          // re-check at most every 30 s
    retry: false,               // don't retry on 403 (role without SETTINGS.CONFIGURE)
  });
}
