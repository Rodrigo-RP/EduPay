import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { apiRequest } from "@/lib/queryClient";

interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  campus_id: number;
  telefono?: string;
  foto_url?: string;
}

interface Guardian {
  id: number;
  email: string;
  nombre_completo: string;
  telefono?: string;
  foto_url?: string;
}

interface AuthContextType {
  user: User | null;
  guardian: Guardian | null;
  isLoading: boolean;
  login: (email: string, password: string, totp_code?: string) => Promise<void>;
  guardianLogin: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [guardian, setGuardian] = useState<Guardian | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check for existing token on mount
    const token = localStorage.getItem("auth_token");
    const userType = localStorage.getItem("auth_type");
    
    if (token && userType) {
      // Verify token and get user data
      setIsLoading(false);
      
      // In a real app, you'd verify the token with the server
      // For now, we'll assume the token is valid
      const userData = localStorage.getItem("auth_user");
      if (userData) {
        const parsedUser = JSON.parse(userData);
        if (userType === "user") {
          setUser(parsedUser);
        } else {
          setGuardian(parsedUser);
        }
      }
    } else {
      setIsLoading(false);
    }
  }, []);

  const login = async (email: string, password: string, totp_code?: string) => {
    try {
      const body: Record<string, string> = { email, password };
      if (totp_code) body.totp_code = totp_code;

      const response = await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });

      const data = await response.json();

      // Server returns { requires_totp: true } when 2FA is configured but no code sent yet
      if (data.requires_totp) {
        const err = new Error("REQUIRES_TOTP");
        (err as any).requires_totp = true;
        throw err;
      }

      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_type", "user");
      localStorage.setItem("auth_user", JSON.stringify(data.user));

      setUser(data.user);
      setGuardian(null);
    } catch (error) {
      throw error;
    }
  };

  const guardianLogin = async (email: string, password: string) => {
    try {
      const response = await apiRequest("/api/auth/guardian-login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
        })
      });
      
      const data = await response.json();
      
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_type", "guardian");
      localStorage.setItem("auth_user", JSON.stringify(data.guardian));
      
      setGuardian(data.guardian);
      setUser(null);
    } catch (error) {
      throw error;
    }
  };

  const logout = () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_type");
    localStorage.removeItem("auth_user");
    setUser(null);
    setGuardian(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        guardian,
        isLoading,
        login,
        guardianLogin,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
