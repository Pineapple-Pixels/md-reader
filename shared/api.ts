/**
 * HTTP client para los endpoints del server.
 *
 * Tres entry points:
 *   - `apiFetch(path, init)`         → /api/<path>            (cookie auth, sin scope)
 *   - `apiFetchPublic(path, init)`   → /api/public/<path>     (sin auth, lee scope public)
 *   - `apiFetchScoped(path, scope)`  → /api/<path>?scope=...  (cookie auth + scope en query)
 *
 * Los callers de pagesde docs usan `apiFetchScoped` (via `useScopedFetch` hook).
 * Login, /auth/me, etc usan `apiFetch` porque esos endpoints no tienen scope.
 */

const BASE = '/api';
const PUBLIC_BASE = '/api/public';

export type ScopeKind = 'me' | 'team' | 'public';

export type Scope =
  | { kind: 'me' }
  | { kind: 'team'; slug: string }
  | { kind: 'public' };

/** Serializa un Scope al valor que espera el backend en `?scope=`. */
export function scopeToQueryParam(scope: Scope): string {
  switch (scope.kind) {
    case 'me': return 'me';
    case 'team': return `team:${scope.slug}`;
    case 'public': return 'public';
  }
}

/** Identificador estable usado como parte de React Query keys. */
export function scopeId(scope: Scope): string {
  switch (scope.kind) {
    case 'me': return 'me';
    case 'team': return `team:${scope.slug}`;
    case 'public': return 'public';
  }
}

async function doFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API ${res.status}: ${text}`);
  }

  return (await res.json()) as T;
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>(`${BASE}${path}`, init);
}

export function apiFetchPublic<T>(path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>(`${PUBLIC_BASE}${path}`, init);
}

/**
 * Llama a `/api/<path>` agregando `?scope=...` (preserva query existente si hay).
 * Si scope=public y `anonymous=true`, usa `/api/public/` sin agregar query.
 */
export function apiFetchScoped<T>(
  path: string,
  scope: Scope,
  init?: RequestInit,
  anonymous = false,
): Promise<T> {
  if (scope.kind === 'public' && anonymous) {
    return apiFetchPublic<T>(path, init);
  }
  const param = scopeToQueryParam(scope);
  const sep = path.includes('?') ? '&' : '?';
  const url = `${BASE}${path}${sep}scope=${encodeURIComponent(param)}`;
  return doFetch<T>(url, init);
}
