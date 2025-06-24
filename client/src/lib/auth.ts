import { apiRequest } from "./queryClient";

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user?: {
    id: number;
    email: string;
    role: string;
  };
  guardian?: {
    id: number;
    email: string;
    nombre_completo: string;
  };
}

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiRequest("POST", "/api/auth/login", credentials);
    return response.json();
  },

  async guardianLogin(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await apiRequest("POST", "/api/auth/guardian-login", credentials);
    return response.json();
  },

  logout() {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_type");
    localStorage.removeItem("auth_user");
  },

  getToken(): string | null {
    return localStorage.getItem("auth_token");
  },

  getAuthType(): string | null {
    return localStorage.getItem("auth_type");
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
