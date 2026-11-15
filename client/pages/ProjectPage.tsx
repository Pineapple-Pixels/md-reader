import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { sanitizeDocHtml } from '../sanitize';
import type { DocKind } from '@shared/doc-types';
import { useScope, useScopedFetch, useScopedUrl, useScopeOrg } from '../hooks/useScope';
import { useAuth } from '../hooks/useAuth';
import { DocFrame } from '../components/DocFrame';
import { HtmlFrame } from '../components/HtmlFrame';
import { CopyToTeam, useCopyTargets } from '../components/CopyToTeam';

declare const hljs: { highlightAll: () => void };

interface ProjectData {
  tree: unknown[];
  kind: DocKind;
  html: string;
  currentFile: string;
  allPages: string[];
}

export function ProjectPage() {
  const { folder } = useParams<{ folder: string }>();
  const [searchParams] = useSearchParams();
  const { id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const scopedUrl = useScopedUrl();
  const org = useScopeOrg();
  const { isAuthenticated } = useAuth();
  const copyTargets = useCopyTargets();
  const [copying, setCopying] = useState(false);

  const page = searchParams.get('page') || '';

  const { data, isLoading } = useQuery<ProjectData>({
    queryKey: ['project', scopeId, folder],
    queryFn: () => scopedFetch(`/project?folder=${encodeURIComponent(folder!)}`),
  });

  const [currentPage, setCurrentPage] = useState('');
  const [docHtml, setDocHtml] = useState('');
  const [docKind, setDocKind] = useState<DocKind>('md');
  const [loadingPage, setLoadingPage] = useState(false);

  const loadPage = useCallback(async (pagePath: string) => {
    setLoadingPage(true);
    try {
      const res = await scopedFetch<{ kind: DocKind; html: string; file: string }>(
        `/project/render?folder=${encodeURIComponent(folder!)}&page=${encodeURIComponent(pagePath)}`
      );
      setDocHtml(res.html);
      setDocKind(res.kind);
      setCurrentPage(pagePath);
      setTimeout(() => hljs?.highlightAll(), 0);
    } catch {
      setDocHtml('<p style="color:var(--danger)">Error al cargar la pagina.</p>');
      setDocKind('md');
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
      setDocKind(data.kind);
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
      {isAuthenticated && copyTargets.length > 0 && (
        <div className="project-actions">
          <button className="action-btn publish-btn" onClick={() => setCopying((v) => !v)}>Copiar carpeta a equipo</button>
        </div>
      )}
      {copying && <CopyToTeam file={folder!} onClose={() => setCopying(false)} />}
      {loadingPage ? (
        <div className="page-loading">Cargando...</div>
      ) : docKind === 'html' ? (
        <HtmlFrame src={scopedUrl(`/frame?file=${encodeURIComponent(currentPage)}`)} title={currentPage} />
      ) : (
        <DocFrame org={org}>
          <div className="doc" dangerouslySetInnerHTML={{ __html: sanitizeDocHtml(docHtml) }} />
        </DocFrame>
      )}
    </div>
  );
}
