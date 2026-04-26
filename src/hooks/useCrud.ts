import { useCallback, useState } from 'react';
import { api } from '../api';
import type { ShowMessage } from './useMessage';

export interface UseCrudOptions {
  endpoint: string;
  refresh: () => Promise<void> | void;
  showMsg?: ShowMessage;
  entityName?: string;
}

export interface UseCrudResult {
  loading: Record<string, boolean>;
  isLoading: (key?: string) => boolean;
  create: (body: Record<string, unknown>, key?: string) => Promise<boolean>;
  update: (id: string, body: Record<string, unknown>, key?: string) => Promise<boolean>;
  remove: (id: string, key?: string) => Promise<boolean>;
  toggle: (id: string, currentDisabled: 'true' | 'false' | undefined, key?: string) => Promise<boolean>;
}

export function useCrud({ endpoint, refresh, showMsg, entityName = 'item' }: UseCrudOptions): UseCrudResult {
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const setKey = useCallback((key: string, value: boolean) => {
    setLoading((prev) => ({ ...prev, [key]: value }));
  }, []);

  const run = useCallback(
    async (key: string, action: () => Promise<unknown>, successMsg: string, failureMsg: string): Promise<boolean> => {
      setKey(key, true);
      try {
        await action();
        showMsg?.(successMsg);
        await refresh();
        return true;
      } catch (e) {
        showMsg?.(`${failureMsg}: ${(e as Error).message}`);
        return false;
      } finally {
        setKey(key, false);
      }
    },
    [setKey, refresh, showMsg],
  );

  const create = useCallback<UseCrudResult['create']>(
    (body, key = 'create') => run(key, () => api('PUT', endpoint, body), `${entityName} created`, `Failed to create ${entityName}`),
    [endpoint, entityName, run],
  );

  const update = useCallback<UseCrudResult['update']>(
    (id, body, key) => run(key ?? `update-${id}`, () => api('PATCH', `${endpoint}/${id}`, body), `${entityName} updated`, `Failed to update ${entityName}`),
    [endpoint, entityName, run],
  );

  const remove = useCallback<UseCrudResult['remove']>(
    (id, key) => run(key ?? `delete-${id}`, () => api('DELETE', `${endpoint}/${id}`), `${entityName} deleted`, `Failed to delete ${entityName}`),
    [endpoint, entityName, run],
  );

  const toggle = useCallback<UseCrudResult['toggle']>(
    (id, currentDisabled, key) => {
      const newDisabled = currentDisabled === 'false' ? 'true' : 'false';
      return run(
        key ?? `toggle-${id}`,
        () => api('PATCH', `${endpoint}/${id}`, { disabled: newDisabled }),
        newDisabled === 'true' ? `${entityName} disabled` : `${entityName} enabled`,
        `Failed to toggle ${entityName}`,
      );
    },
    [endpoint, entityName, run],
  );

  const isLoading = useCallback((key?: string) => (key ? !!loading[key] : Object.values(loading).some(Boolean)), [loading]);

  return { loading, isLoading, create, update, remove, toggle };
}
