/**
 * HTTP client para los endpoints del server.
 *
 * Tres entry points:
 *   - `apiFetch(path, init)`         → /api/<path>            (cookie auth, sin scope)
 *   - `apiFetchPublic(org, path)`    → /api/public/<org><path> (sin auth, publicos de una org)
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
  | { kind: 'public'; org: string };

/** Serializa un Scope al valor que espera el backend en `?scope=`. */
export function scopeToQueryParam(scope: Scope): string {
  switch (scope.kind) {
    case 'me': return 'me';
    case 'team': return `team:${scope.slug}`;
    case 'public': return `public:${scope.org}`;
  }
}

/** Identificador estable usado como parte de React Query keys. */
export function scopeId(scope: Scope): string {
  switch (scope.kind) {
    case 'me': return 'me';
    case 'team': return `team:${scope.slug}`;
    case 'public': return `public:${scope.org}`;
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
    throw new ApiError(res.status, text);
  }

  return (await res.json()) as T;
}

/** A non-2xx response; `body` is the parsed JSON body when there is one. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: Record<string, unknown> | null;
  constructor(status: number, text: string) {
    super(`API ${status}: ${text}`);
    this.status = status;
    let body: Record<string, unknown> | null = null;
    try { body = JSON.parse(text) as Record<string, unknown>; } catch { /* not JSON */ }
    this.body = body;
  }
}

export function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>(`${BASE}${path}`, init);
}

export function apiFetchPublic<T>(org: string, path: string, init?: RequestInit): Promise<T> {
  return doFetch<T>(`${PUBLIC_BASE}/${encodeURIComponent(org)}${path}`, init);
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
  return doFetch<T>(scopedUrl(path, scope, anonymous), init);
}

/** URL of a scoped endpoint, for links, downloads and iframes. */
export function scopedUrl(path: string, scope: Scope, anonymous = false): string {
  if (scope.kind === 'public' && anonymous) {
    return `${PUBLIC_BASE}/${encodeURIComponent(scope.org)}${path}`;
  }
  const param = scopeToQueryParam(scope);
  const sep = path.includes('?') ? '&' : '?';
  return `${BASE}${path}${sep}scope=${encodeURIComponent(param)}`;
}
