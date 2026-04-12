import { createContext, useContext, useMemo, useCallback, type ReactNode } from 'react';
import {
  apiFetchScoped,
  scopeId,
  type Scope,
} from '@shared/api';
import { useAuth } from './useAuth';

// -----------------------------------------------------------------------------
// ScopeContext: propaga el scope activo (inferido del routing) al arbol de
// componentes. Las paginas no tienen que derivarlo del URL cada una — lo
// toman del contexto via `useScope()`.
// -----------------------------------------------------------------------------

interface ScopeContextValue {
  scope: Scope;
  // Prefix de URL del scope: '/me', '/t/<slug>', '/pub'. Sirve para construir
  // hrefs relativos al scope (ej. `${prefix}/doc/archivo.md`).
  urlPrefix: string;
  // Identificador estable para React Query keys ('me', 'team:<slug>', 'public').
  id: string;
}

const ScopeContext = createContext<ScopeContextValue | null>(null);

export function ScopeProvider({ scope, children }: { scope: Scope; children: ReactNode }) {
  const value = useMemo<ScopeContextValue>(() => ({
    scope,
    urlPrefix:
      scope.kind === 'me' ? '/me' :
      scope.kind === 'team' ? `/t/${scope.slug}` :
      '/pub',
    id: scopeId(scope),
  }), [scope]);
  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope(): ScopeContextValue {
  const ctx = useContext(ScopeContext);
  if (!ctx) throw new Error('useScope debe usarse dentro de <ScopeProvider>');
  return ctx;
}

// -----------------------------------------------------------------------------
// useScopedFetch: wrapper de apiFetchScoped que toma el scope del contexto y
// decide automaticamente si usar /api/public (anonimo) o /api/?scope=public
// (logueado). Las paginas lo usan casi siempre en vez de importar apiFetch.
// -----------------------------------------------------------------------------

export function useScopedFetch() {
  const { scope } = useScope();
  const { isAuthenticated } = useAuth();

  // Para scope public, si no hay cookie usamos /api/public (lectura anonima).
  // Si hay cookie, usamos /api/?scope=public para que el backend reconozca al
  // user (ej. permitir comentarios).
  const anonymous = scope.kind === 'public' && !isAuthenticated;

  return useCallback(
    <T,>(path: string, init?: RequestInit): Promise<T> =>
      apiFetchScoped<T>(path, scope, init, anonymous),
    [scope, anonymous],
  );
}
