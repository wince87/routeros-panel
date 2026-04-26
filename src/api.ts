import type { AuthData, HttpMethod } from './types/router';

const STORAGE_KEY = 'router-auth';

type UnauthorizedHandler = (() => void) | null;
let onUnauthorized: UnauthorizedHandler = null;

export function setUnauthorizedHandler(fn: UnauthorizedHandler): void {
  onUnauthorized = fn;
}

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'UnauthorizedError';
  }
}

function getAuth(): AuthData | null {
  const saved = sessionStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved) as AuthData;
    if (!parsed?.ip || !parsed?.username || !parsed?.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function getBaseUrl(auth: AuthData): { url: string; headers: Record<string, string> } {
  const target = `${auth.protocol || 'https'}://${auth.ip}`;
  return { url: '/api', headers: { 'X-Router-Target': target } };
}

export async function api<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
  const auth = getAuth();
  if (!auth?.token) throw new UnauthorizedError();
  const { url, headers } = getBaseUrl(auth);
  const opts: RequestInit = {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Basic ${auth.token}`,
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`${url}${path}`, opts);
  if (res.status === 401) {
    sessionStorage.removeItem(STORAGE_KEY);
    if (onUnauthorized) onUnauthorized();
    throw new UnauthorizedError();
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') return null as T;
  return res.json() as Promise<T>;
}

export async function apiList<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T[]> {
  try {
    const r = await api<T[] | null>(method, path, body);
    return Array.isArray(r) ? r : [];
  } catch (e) {
    if (e instanceof UnauthorizedError) throw e;
    return [];
  }
}
