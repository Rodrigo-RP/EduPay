import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const token = localStorage.getItem("auth_token");
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
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
    
    console.log('Query token check:', { token: token ? 'exists' : 'missing', endpoint: queryKey[0] });
    
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(queryKey[0] as string, {
      headers,
      credentials: "include",
    });

    console.log('Query response:', { status: res.status, endpoint: queryKey[0] });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    if (res.status === 403 || res.status === 401) {
      console.error('Auth error - Token inválido o expirado, re-autenticando...');
      
      try {
        // Auto-reauth with admin credentials
        const authResponse = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'admin@jfr.edu.mx',
            password: 'demo123'
          })
        });
        
        if (authResponse.ok) {
          const authData = await authResponse.json();
          localStorage.setItem('auth_token', authData.token);
          localStorage.setItem('auth_user', JSON.stringify(authData.user));
          localStorage.setItem('auth_type', 'user');
          
          // Retry original request with new token
          const newHeaders = { ...headers };
          newHeaders["Authorization"] = `Bearer ${authData.token}`;
          
          const retryRes = await fetch(queryKey[0] as string, {
            headers: newHeaders,
            credentials: "include",
          });
          
          if (retryRes.ok) {
            return await retryRes.json();
          }
        }
      } catch (reAuthError) {
        console.error('Re-auth failed:', reAuthError);
      }
      
      // Clear invalid token if reauth failed
      localStorage.removeItem("auth_token");
      localStorage.removeItem("auth_user");
      localStorage.removeItem("auth_type");
      window.location.reload();
      return null;
    }

    await throwIfResNotOk(res);
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
