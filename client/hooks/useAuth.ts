import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import type { AuthResponse, TeamMembership } from '@shared/types';

interface AuthState {
  isAuthenticated: boolean;
  user: string | null;
  displayName: string | null;
  role: 'admin' | 'member' | null;
  teams: TeamMembership[];
  isLoading: boolean;
  // true mientras hay un request de /auth/me en vuelo, incluso si ya hay data
  // cacheada. Los guards de ruta lo necesitan para no rebotar a /login con
  // data vieja mientras se esta revalidando la sesion.
  isFetching: boolean;
  error: Error | null;
}

// Opciones compartidas de la query de sesion. Se exportan para que el login
// pueda hacer `queryClient.fetchQuery(...)` con la MISMA queryKey/queryFn y
// dejar el cache poblado antes de navegar (ver LoginPage).
export const authQueryOptions = {
  queryKey: ['auth'] as const,
  queryFn: () => apiFetch<AuthResponse>('/auth/me'),
  staleTime: 5 * 60 * 1000,
  retry: false,
};

export function useAuth(): AuthState {
  const { data, isLoading, isFetching, error } = useQuery<AuthResponse, Error>(authQueryOptions);

  return {
    isAuthenticated: data?.authenticated ?? false,
    user: data?.user ?? null,
    displayName: data?.displayName ?? null,
    role: data?.role ?? null,
    teams: data?.teams ?? [],
    isLoading,
    isFetching,
    error: error ?? null,
  };
}
