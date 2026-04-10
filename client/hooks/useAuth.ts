import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';

interface AuthState {
  isAuthenticated: boolean;
  user: string | null;
  isLoading: boolean;
  error: Error | null;
}

interface AuthResponse {
  authenticated: boolean;
  user?: string;
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
    isLoading,
    error: error ?? null,
  };
}
