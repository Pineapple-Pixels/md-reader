import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RenderResponse } from '@shared/types';
import { useScope, useScopedFetch } from './useScope';

type Fetcher = <T>(path: string) => Promise<T>;

/** The rendered document query: DocPage reads it, the sidebar and the first page load fetch it ahead. */
export function docQuery(fetcher: Fetcher, scopeId: string, file: string) {
  return {
    queryKey: ['doc', scopeId, file],
    queryFn: () => fetcher<RenderResponse>(`/render?file=${encodeURIComponent(file)}`),
  };
}

export function usePrefetchDoc(): (file: string) => void {
  const queryClient = useQueryClient();
  const { id } = useScope();
  const scopedFetch = useScopedFetch();
  return useCallback((file: string) => { void queryClient.prefetchQuery(docQuery(scopedFetch, id, file)); }, [queryClient, id, scopedFetch]);
}
