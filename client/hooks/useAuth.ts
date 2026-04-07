import { useQuery } from '@tanstack/react-query';

interface AuthState {
  isAuthenticated: boolean;
  user: string | null;
  isLoading: boolean;
}

export function useAuth(): AuthState {
  const { data, isLoading } = useQuery({
    queryKey: ['auth'],
    queryFn: async () => {
      const res = await fetch('/api/auth/me', { credentials: 'same-origin' });
      if (!res.ok) return { authenticated: false, user: null };
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return {
    isAuthenticated: data?.authenticated ?? false,
    user: data?.user ?? null,
    isLoading,
  };
}
