import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode
} from "react";
import type { User } from "../types";
import { apiGetCurrentUser } from "../api/services";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (user: User, token: string) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = window.localStorage.getItem("jde_token");
    if (token) {
      loadUser();
    } else {
      setLoading(false);
    }
  }, []);

  async function loadUser() {
    try {
      setLoading(true);
      const userData = await apiGetCurrentUser();
      setUser(userData);
    } catch {
      window.localStorage.removeItem("jde_token");
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  function login(userData: User, token: string) {
    window.localStorage.setItem("jde_token", token);
    setUser(userData);
  }

  function logout() {
    window.localStorage.removeItem("jde_token");
    setUser(null);
  }

  async function refreshUser() {
    await loadUser();
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser }}>
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
