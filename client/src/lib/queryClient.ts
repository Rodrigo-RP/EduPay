import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { redirectGuardianToLogin } from "./guardian-session";

async function notifyInvalidSession(res: Response, requestToken: string | null) {
  if (typeof window === "undefined") return;
  // Una respuesta de la sesión anterior no invalida la que acaba de entrar.
  if (localStorage.getItem("auth_token") !== requestToken) return;
  if (localStorage.getItem("auth_type") === "guardian" && (res.status === 401 || res.status === 403)) {
    redirectGuardianToLogin();
    window.dispatchEvent(new Event("auth:invalid-session"));
    return;
  }
  const body = await res.clone().json().catch(() => null) as { code?: string; message?: string } | null;
  const invalidatedByServer = res.status === 401 && body?.code === "SESSION_INVALIDATED";
  const invalidJwt = res.status === 403 && body?.message === "Token inválido";
  if (invalidatedByServer || invalidJwt) {
    window.dispatchEvent(new Event("auth:invalid-session"));
  }
}

async function throwIfResNotOk(res: Response, requestToken: string | null) {
  if (!res.ok) {
    await notifyInvalidSession(res, requestToken);
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  url: string,
  options?: {
    method?: string;
    body?: string;
    headers?: Record<string, string>;
  }
): Promise<Response> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {
    ...options?.headers,
  };
  
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: options?.method || "GET",
    headers,
    body: options?.body,
    credentials: "include",
  });

  await throwIfResNotOk(res, token);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const token = localStorage.getItem("auth_token");
    const headers: Record<string, string> = {};
    
    // Query token validated
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    // Query response processed
    if ((res.status === 401 || res.status === 403) && localStorage.getItem("auth_token") !== token) {
      await throwIfResNotOk(res, token);
    }

    if (localStorage.getItem("auth_type") === "guardian" && (res.status === 401 || res.status === 403)) {
      await throwIfResNotOk(res, token);
    }
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      await notifyInvalidSession(res, token);
      return null;
    }

    if (res.status === 401) {
      await notifyInvalidSession(res, token);
      // Session expired or invalid — clear and redirect to login.
      // NEVER auto-reauthenticate: doing so with stored credentials is a
      // privilege-escalation risk (e.g. a guardian JWT expiring could silently
      // log the user in as an admin).
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      localStorage.removeItem("auth_type");
      window.location.href = "/";
      return null;
    }

    if (res.status === 403) {
      // Forbidden — throw so the UI can show an appropriate error.
      throw new Error("403: No tienes permiso para realizar esta acción");
    }

    await throwIfResNotOk(res, token);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
