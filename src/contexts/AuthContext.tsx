import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { setUnauthorizedHandler } from '../api';
import type { AuthData } from '../types/router';

interface AuthContextValue {
  auth: AuthData | null;
  login: (ip: string, username: string, password: string, protocol?: 'http' | 'https') => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const STORAGE_KEY = 'router-auth';

function readStored(): AuthData | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AuthData;
    if (!data?.ip || !data?.username || !data?.token) return null;
    return data;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthData | null>(readStored);

  const login = useCallback<AuthContextValue['login']>((ip, username, password, protocol = 'https') => {
    const token = btoa(`${username}:${password}`);
    const data: AuthData = { ip, username, token, protocol };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    setAuth(data);
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setAuth(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, logout, isAuthenticated: !!auth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
