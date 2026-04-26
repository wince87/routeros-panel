import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { api } from '../api';
import type { SystemIdentity, SystemResource } from '../types/router';

interface RouterDataValue {
  identity: SystemIdentity | null;
  resource: SystemResource | null;
  refresh: () => Promise<void>;
}

const RouterDataContext = createContext<RouterDataValue | null>(null);

export function RouterDataProvider({ children }: { children: ReactNode }) {
  const [identity, setIdentity] = useState<SystemIdentity | null>(null);
  const [resource, setResource] = useState<SystemResource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [id, res] = await Promise.all([
        api<SystemIdentity>('GET', '/system/identity'),
        api<SystemResource>('GET', '/system/resource'),
      ]);
      setIdentity(id);
      setResource(res);
    } catch (e) {
      console.error('RouterData refresh:', e);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10000);
    return () => clearInterval(id);
  }, [refresh]);

  return (
    <RouterDataContext.Provider value={{ identity, resource, refresh }}>
      {children}
    </RouterDataContext.Provider>
  );
}

export function useRouterData(): RouterDataValue {
  const ctx = useContext(RouterDataContext);
  if (!ctx) throw new Error('useRouterData must be used within RouterDataProvider');
  return ctx;
}
