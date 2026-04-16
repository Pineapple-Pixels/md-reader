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
  error: Error | null;
}

export function useAuth(): AuthState {
  const { data, isLoading, error } = useQuery<AuthResponse, Error>({
    queryKey: ['auth'],
    queryFn: () => apiFetch<AuthResponse>('/auth/me'),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    isAuthenticated: data?.authenticated ?? false,
    user: data?.user ?? null,
    displayName: data?.displayName ?? null,
    role: data?.role ?? null,
    teams: data?.teams ?? [],
    isLoading,
    error: error ?? null,
  };
}
