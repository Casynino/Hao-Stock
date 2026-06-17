import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import api, { tokenStore, unwrap, apiError } from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore the session on first load if a token is present.
  useEffect(() => {
    let active = true;
    async function bootstrap() {
      if (!tokenStore.get()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.get('/auth/me');
        if (active) setUser(unwrap(res).data);
      } catch {
        tokenStore.clear();
      } finally {
        if (active) setLoading(false);
      }
    }
    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const res = await api.post('/auth/login', { email, password });
      const { user: u, tokens } = unwrap(res).data;
      tokenStore.set(tokens.accessToken, tokens.refreshToken);
      setUser(u);
      return { ok: true, user: u };
    } catch (err) {
      return { ok: false, message: apiError(err, 'Login failed') };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      /* ignore */
    }
    tokenStore.clear();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const res = await api.get('/auth/me');
    setUser(unwrap(res).data);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAuthenticated: !!user,
      role: user?.role,
      hasRole: (...roles) => !!user && (user.role === 'ADMIN' || roles.includes(user.role)),
      hasPermission: (key) =>
        !!user && (user.role === 'ADMIN' || (user.permissions || []).includes(key)),
      login,
      logout,
      refreshUser,
      setUser,
    }),
    [user, loading, login, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
