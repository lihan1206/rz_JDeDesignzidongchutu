import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { message } from "antd";
import { apiGetCurrentUser, apiLogin, apiRegister } from "../api/services";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => window.localStorage.getItem("jde_token"));
  const [user, setUser] = useState(() => {
    const raw = window.localStorage.getItem("jde_user");
    return raw ? JSON.parse(raw) : null;
  });
  const [loading, setLoading] = useState(Boolean(token));

  useEffect(() => {
    let active = true;

    async function fetchUser() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const current = await apiGetCurrentUser();
        if (active) {
          setUser(current);
          window.localStorage.setItem("jde_user", JSON.stringify(current));
        }
      } catch (_error) {
        if (active) {
          setToken(null);
          setUser(null);
          window.localStorage.removeItem("jde_token");
          window.localStorage.removeItem("jde_user");
          message.warning("登录状态已过期，请重新登录");
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    fetchUser();

    return () => {
      active = false;
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      async login(payload) {
        const data = await apiLogin(payload);
        setToken(data.token);
        setUser(data.user);
        window.localStorage.setItem("jde_token", data.token);
        window.localStorage.setItem("jde_user", JSON.stringify(data.user));
      },
      async register(payload) {
        const data = await apiRegister(payload);
        setToken(data.token);
        setUser(data.user);
        window.localStorage.setItem("jde_token", data.token);
        window.localStorage.setItem("jde_user", JSON.stringify(data.user));
      },
      logout() {
        setToken(null);
        setUser(null);
        window.localStorage.removeItem("jde_token");
        window.localStorage.removeItem("jde_user");
      }
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth 必须在 AuthProvider 内部使用");
  }
  return context;
}
