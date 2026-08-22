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
  if (!token) throw new Error("No authenticated session");

  const res = await fetch("/api/admin/configuracion/onboarding-status", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    // AuthProvider restores a cached session optimistically. If the token was
    // revoked or expired, terminate it immediately instead of leaving a stale
    // admin shell that can keep remounting this guard and hammering the API.
    if (res.status === 401 || res.status === 403) {
      window.dispatchEvent(new Event("auth:invalid-session"));
    }
    throw new Error("onboarding-status fetch failed");
  }
  return res.json();
}

export function useOnboardingStatus() {
  const hasToken = Boolean(localStorage.getItem("auth_token"));
  return useQuery<OnboardingStatus>({
    queryKey: ["onboarding-status"],
    queryFn: fetchOnboardingStatus,
    staleTime: 30_000,          // re-check at most every 30 s
    retry: false,               // don't retry on 403 (role without SETTINGS.CONFIGURE)
    enabled: hasToken,
  });
}
