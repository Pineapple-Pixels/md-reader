import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useScope, useScopedFetch } from '../hooks/useScope';

declare const hljs: { highlightAll: () => void };

interface ProjectData {
  tree: unknown[];
  html: string;
  currentFile: string;
  allPages: string[];
}

export function ProjectPage() {
  const { folder } = useParams<{ folder: string }>();
  const [searchParams] = useSearchParams();
  const { id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  const page = searchParams.get('page') || '';

  const { data, isLoading } = useQuery<ProjectData>({
    queryKey: ['project', scopeId, folder],
    queryFn: () => scopedFetch(`/project?folder=${encodeURIComponent(folder!)}`),
  });

  const [currentPage, setCurrentPage] = useState('');
  const [docHtml, setDocHtml] = useState('');
  const [loadingPage, setLoadingPage] = useState(false);

  const loadPage = useCallback(async (pagePath: string) => {
    setLoadingPage(true);
    try {
      const res = await scopedFetch<{ html: string; file: string }>(
        `/project/render?folder=${encodeURIComponent(folder!)}&page=${encodeURIComponent(pagePath)}`
      );
      setDocHtml(res.html);
      setCurrentPage(pagePath);
      setTimeout(() => hljs?.highlightAll(), 0);
    } catch {
      setDocHtml('<p style="color:var(--danger)">Error al cargar la pagina.</p>');
    }
    setLoadingPage(false);
  }, [folder, scopedFetch]);

  // When `page` search param changes (driven by the sidebar), load that page.
  useEffect(() => {
    if (!data) return;
    const target = page || data.currentFile;
    if (target === currentPage && docHtml) return;
    if (target === data.currentFile && !page) {
      setCurrentPage(data.currentFile);
      setDocHtml(data.html);
      setTimeout(() => hljs?.highlightAll(), 0);
    } else {
      loadPage(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, page]);

  if (isLoading) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Cargando...
      </div>
    );
  }

  return (
    <div className="project-content-wrapper">
      {loadingPage ? (
        <div className="page-loading">Cargando...</div>
      ) : (
        <div className="doc" dangerouslySetInnerHTML={{ __html: docHtml }} />
      )}
    </div>
  );
}
