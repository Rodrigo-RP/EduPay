// Utility functions for authentication and token management
import { useToast } from "@/hooks/use-toast";

export const getAuthToken = (): string | null => {
  return localStorage.getItem('auth_token');
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    const currentTime = Date.now() / 1000;
    return payload.exp < currentTime;
  } catch (error) {
    return true;
  }
};

export const handleAuthError = (response: Response): boolean => {
  if (response.status === 401 || response.status === 403) {
    localStorage.removeItem('auth_token');
    window.location.href = '/login';
    return true;
  }
  return false;
};

export const refreshToken = async (): Promise<string | null> => {
  try {
    const currentToken = getAuthToken();
    if (!currentToken) return null;

    const response = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${currentToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.ok) {
      const data = await response.json();
      localStorage.setItem('auth_token', data.token);
      return data.token;
    }
  } catch (error) {
    console.error('Error refreshing token:', error);
  }
  
  return null;
};

export const createAuthenticatedRequest = async (
  url: string,
  options: RequestInit = {}
): Promise<Response> => {
  let token = getAuthToken();
  
  if (!token) {
    throw new Error('No hay sesión activa');
  }

  // If token is expired, try to refresh it
  if (isTokenExpired(token)) {
    const newToken = await refreshToken();
    if (newToken) {
      token = newToken;
    } else {
      localStorage.removeItem('auth_token');
      throw new Error('Sesión expirada');
    }
  }

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(url, {
    ...options,
    headers,
  });

  // If still unauthorized, try one more time with token refresh
  if (response.status === 401 || response.status === 403) {
    const newToken = await refreshToken();
    if (newToken) {
      const retryHeaders = new Headers(options.headers);
      retryHeaders.set('Authorization', `Bearer ${newToken}`);
      
      const retryResponse = await fetch(url, {
        ...options,
        headers: retryHeaders,
      });
      
      if (retryResponse.status === 401 || retryResponse.status === 403) {
        localStorage.removeItem('auth_token');
        throw new Error('Sesión expirada');
      }
      
      return retryResponse;
    } else {
      localStorage.removeItem('auth_token');
      throw new Error('Sesión expirada');
    }
  }

  return response;
};

export function isUnauthorizedError(error: Error): boolean {
  return /^401: .*Unauthorized/.test(error.message);
}