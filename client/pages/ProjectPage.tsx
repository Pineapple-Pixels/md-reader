import { useState, useEffect, useCallback } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from '../hooks/useTheme';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { SearchModal } from '../components/SearchModal';

declare const hljs: { highlightAll: () => void };

interface TreeItem {
  type: 'file' | 'folder';
  name: string;
  path: string;
  children?: TreeItem[];
}

interface ProjectData {
  tree: TreeItem[];
  html: string;
  currentFile: string;
  allPages: string[];
}

export function ProjectPage() {
  const { folder } = useParams<{ folder: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isDark, toggle } = useTheme();
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  const page = searchParams.get('page') || '';

  const { data, isLoading } = useQuery<ProjectData>({
    queryKey: ['project', scopeId, folder],
    queryFn: () => scopedFetch(`/project?folder=${encodeURIComponent(folder!)}`),
  });

  const [currentPage, setCurrentPage] = useState('');
  const [docHtml, setDocHtml] = useState('');
  const [loadingPage, setLoadingPage] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const loadPage = useCallback(async (pagePath: string) => {
    setLoadingPage(true);
    try {
      const res = await scopedFetch<{ html: string; file: string }>(
        `/project/render?folder=${encodeURIComponent(folder!)}&page=${encodeURIComponent(pagePath)}`
      );
      setDocHtml(res.html);
      setCurrentPage(pagePath);
      setSearchParams({ page: pagePath }, { replace: true });
      setTimeout(() => hljs?.highlightAll(), 0);
    } catch {
      setDocHtml('<p style="color:var(--danger)">Error al cargar la pagina.</p>');
    }
    setLoadingPage(false);
  }, [folder, scopedFetch, setSearchParams]);

  // Initialize when data first arrives. IMPORTANT: do not depend on `page` —
  // loadPage already calls setSearchParams({ page }), and if we re-ran this
  // effect on page changes it would clobber docHtml with data.html (the
  // mainPage) every time the user clicked a different file.
  useEffect(() => {
    if (!data) return;
    const target = page || data.currentFile;
    if (target === data.currentFile) {
      setCurrentPage(data.currentFile);
      setDocHtml(data.html);
      setTimeout(() => hljs?.highlightAll(), 0);
    } else {
      loadPage(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function firstFileInTree(items: TreeItem[]): string | null {
    for (const item of items) {
      if (item.type === 'file') return item.path;
      if (item.type === 'folder' && item.children) {
        const found = firstFileInTree(item.children);
        if (found) return found;
      }
    }
    return null;
  }

  function renderTree(items: TreeItem[], depth = 0): React.ReactNode {
    return items.map((item) => {
      if (item.type === 'folder') {
        const isCollapsed = collapsed.has(item.path);
        return (
          <li key={item.path} className={`tree-folder tree-indent-${depth}${isCollapsed ? ' collapsed' : ''}`}>
            <div
              className="tree-item"
              onClick={() => {
                toggleFolder(item.path);
                const first = firstFileInTree(item.children || []);
                if (first) loadPage(first);
              }}
            >
              <span className="tree-chevron">&#9654;</span>
              <span className="tree-icon">&#128193;</span>
              {item.name}
            </div>
            <ul className="sidebar-tree tree-children">
              {renderTree(item.children || [], depth + 1)}
            </ul>
          </li>
        );
      }
      return (
        <li key={item.path} className={`tree-indent-${depth}`}>
          <a
            className={`tree-item${currentPage === item.path ? ' active' : ''}`}
            href="#"
            onClick={(e) => { e.preventDefault(); loadPage(item.path); }}
          >
            <span className="tree-icon">&#128196;</span>
            {item.name}
          </a>
        </li>
      );
    });
  }

  if (isLoading) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</div>;

  const canWrite = scope.kind !== 'public';
  const editUrl = `${urlPrefix}/edit/${currentPage}`;

  return (
    <div className="project-layout" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div className="project-toolbar">
        <Link to={urlPrefix}>&larr; Volver</Link>
        <span className="title" style={{ fontWeight: 600, fontSize: 15, marginRight: 'auto' }}>{folder}</span>
        {canWrite && <Link to={editUrl} className="primary">Editar</Link>}
        <button className="theme-toggle" onClick={toggle}>{isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}</button>
      </div>
      <div className="project-body" style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        <nav className="project-sidebar">
          <ul className="sidebar-tree">
            {data && renderTree(data.tree)}
          </ul>
        </nav>
        <main className="project-content">
          {loadingPage ? (
            <div className="page-loading">Cargando...</div>
          ) : (
            <div className="doc" dangerouslySetInnerHTML={{ __html: docHtml }} />
          )}
        </main>
      </div>
      {canWrite && <SearchModal />}
    </div>
  );
}
