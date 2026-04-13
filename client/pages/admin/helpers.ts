import { apiFetch } from '@shared/api';
import type { QueryClient } from '@tanstack/react-query';

export function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/admin${path}`, init);
}

export type ToastFn = (msg: string, type?: 'success' | 'error' | 'info') => void;

export interface PanelProps {
  toast: ToastFn;
  queryClient: QueryClient;
}
