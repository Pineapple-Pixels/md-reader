import { useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { useNavStore, useFavorites } from '../hooks/useNavStore';
import { SearchIcon, ChevronRightIcon, FolderIcon, HomeIcon, FileIcon, FileGenericIcon } from './Icons';
import s from './Sidebar.module.css';
import type { FileEntry } from '@shared/types';

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

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const isProjectRoute = location.pathname.includes('/project/');

  if (isProjectRoute) {
    return <ProjectSidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
  }

  return <DocsSidebar mobileOpen={mobileOpen} onMobileClose={onMobileClose} />;
}

/* -------------------------------------------------------------------------- */
/* Docs sidebar (default mode)                                                */
/* -------------------------------------------------------------------------- */

function DocsSidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  const openTab = useNavStore((s) => s.openTab);
  const toggleFavorite = useNavStore((s) => s.toggleFavorite);
  const isFavorite = useNavStore((s) => s.isFavorite);
  const recents = useNavStore((s) => s.recents);
  const favorites = useFavorites();

  const { data: files } = useQuery<FileEntry[]>({
    queryKey: ['docs', scopeId],
    queryFn: () => scopedFetch<FileEntry[]>('/docs'),
  });

  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({});

  const toggleFolder = (folder: string) => {
    setOpenFolders((prev) => ({ ...prev, [folder]: !prev[folder] }));
  };

  const goToDoc = (file: string) => {
    openTab(file);
    navigate(`${urlPrefix}/doc/${encodeURIComponent(file)}`);
    onMobileClose?.();
  };

  const isActive = (file: string) =>
    decodeURIComponent(location.pathname).includes(file);

  const rootFiles: FileEntry[] = [];
  const folders: Record<string, FileEntry[]> = {};

  for (const f of files ?? []) {
    const slash = f.name.indexOf('/');
    if (slash === -1) {
      rootFiles.push(f);
    } else {
      const folder = f.name.slice(0, slash);
      (folders[folder] ??= []).push(f);
    }
  }

  const recentFiles = recents();
  const displayName = (file: string) => file.replace(/\.md$/i, '').split('/').pop() ?? file;

  return (
    <aside className={`${s.sidebar}${mobileOpen ? ` ${s.mobileOpen}` : ''}`}>
      <div className={s.sidebarHeader}>
        <div className={s.sidebarLogo}>
          <div className={s.sidebarLogoIcon}><span>M</span></div>
          <span className={s.sidebarLogoText}>md-reader</span>
        </div>
        <button className={s.sidebarSearch} onClick={() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))}>
          <SearchIcon />
          <span>Buscar...</span>
          <kbd style={{ marginLeft: 'auto', fontSize: 10, opacity: 0.6 }}>⌘K</kbd>
        </button>
      </div>

      <div className={s.sidebarScroll}>
        {favorites.length > 0 && (
          <>
            <div className={s.sidebarSectionLabel}>Favoritos</div>
            {favorites.map((file) => (
              <SidebarItem
                key={`fav-${file}`}
                file={file}
                displayName={displayName(file)}
                active={isActive(file)}
                favorited
                onToggleFav={() => toggleFavorite(file)}
                onClick={() => goToDoc(file)}
              />
            ))}
          </>
        )}

        {recentFiles.length > 0 && (
          <>
            <div className={s.sidebarSectionLabel}>Recientes</div>
            {recentFiles.map((file) => (
              <SidebarItem
                key={`rec-${file}`}
                file={file}
                displayName={displayName(file)}
                active={isActive(file)}
                favorited={isFavorite(file)}
                onToggleFav={() => toggleFavorite(file)}
                onClick={() => goToDoc(file)}
              />
            ))}
          </>
        )}

        <div className={s.sidebarSectionLabel}>Documentos</div>
        {rootFiles.map((f) => (
          <SidebarItem
            key={f.name}
            file={f.name}
            displayName={displayName(f.name)}
            active={isActive(f.name)}
            favorited={isFavorite(f.name)}
            onToggleFav={() => toggleFavorite(f.name)}
            onClick={() => goToDoc(f.name)}
          />
        ))}

        {Object.entries(folders).sort(([a], [b]) => a.localeCompare(b)).map(([folder, items]) => {
          const isOpen = openFolders[folder] !== false;
          return (
            <div key={folder}>
              <button className={s.sidebarFolderBtn} onClick={() => toggleFolder(folder)}>
                <span className={`${s.sidebarFolderChevron}${isOpen ? ` ${s.open}` : ''}`}>
                  <ChevronRightIcon />
                </span>
                <FolderIcon />
                <span>{folder}</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>{items.length}</span>
              </button>
              {isOpen && items.map((f) => (
                <SidebarItem
                  key={f.name}
                  file={f.name}
                  displayName={displayName(f.name)}
                  active={isActive(f.name)}
                  favorited={isFavorite(f.name)}
                  onToggleFav={() => toggleFavorite(f.name)}
                  onClick={() => goToDoc(f.name)}
                  indent
                />
              ))}
            </div>
          );
        })}
      </div>

      <div className={s.sidebarFooter}>
        <button className={s.sidebarItem} onClick={() => { navigate(urlPrefix); onMobileClose?.(); }} style={{ width: '100%' }}>
          <HomeIcon />
          <span>Todos los documentos</span>
        </button>
      </div>
    </aside>
  );
}

/* -------------------------------------------------------------------------- */
/* Project sidebar (file tree mode)                                           */
/* -------------------------------------------------------------------------- */

function ProjectSidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { urlPrefix, id: scopeId, scope } = useScope();
  const scopedFetch = useScopedFetch();

  // Extract folder name from URL: .../project/<folder>
  const folderMatch = location.pathname.match(/\/project\/([^/?]+)/);
  const folder = folderMatch ? decodeURIComponent(folderMatch[1]) : '';

  const { data, isLoading } = useQuery<ProjectData>({
    queryKey: ['project', scopeId, folder],
    queryFn: () => scopedFetch<ProjectData>(`/project?folder=${encodeURIComponent(folder)}`),
    enabled: !!folder,
  });

  const currentPage = searchParams.get('page') || data?.currentFile || '';
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleFolder(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function goToPage(pagePath: string) {
    setSearchParams({ page: pagePath }, { replace: true });
    onMobileClose?.();
  }

  function renderTree(items: TreeItem[], depth = 0): React.ReactNode {
    return items.map((item) => {
      if (item.type === 'folder') {
        const isCollapsed = collapsed.has(item.path);
        return (
          <div key={item.path}>
            <button
              className={s.sidebarFolderBtn}
              onClick={() => toggleFolder(item.path)}
              style={depth > 0 ? { paddingLeft: 14 + depth * 12 } : undefined}
            >
              <span className={`${s.sidebarFolderChevron}${!isCollapsed ? ` ${s.open}` : ''}`}>
                <ChevronRightIcon />
              </span>
              <FolderIcon />
              <span>{item.name}</span>
              {item.children && (
                <span style={{ marginLeft: 'auto', fontSize: 11, opacity: 0.5 }}>{item.children.length}</span>
              )}
            </button>
            {!isCollapsed && item.children && (
              <div>{renderTree(item.children, depth + 1)}</div>
            )}
          </div>
        );
      }
      const isActive = currentPage === item.path;
      return (
        <button
          key={item.path}
          className={`${s.sidebarItem}${isActive ? ` ${s.active}` : ''}`}
          onClick={() => goToPage(item.path)}
          style={{ paddingLeft: 14 + depth * 12 }}
        >
          <FileIcon />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
            {item.name.replace(/\.md$/i, '')}
          </span>
        </button>
      );
    });
  }

  const canWrite = scope.kind !== 'public';
  const editUrl = currentPage ? `${urlPrefix}/edit/${currentPage}` : '';

  return (
    <aside className={`${s.sidebar} ${s.sidebarProject}${mobileOpen ? ` ${s.mobileOpen}` : ''}`}>
      <div className={s.sidebarHeader}>
        <div className={s.sidebarLogo}>
          <FolderIcon size={16} />
          <span className={s.sidebarLogoText}>{folder}</span>
        </div>
      </div>

      <div className={s.sidebarScroll}>
        {isLoading && (
          <div className={s.sidebarSectionLabel}>Cargando...</div>
        )}
        {data && (
          <>
            <div className={s.sidebarSectionLabel}>Archivos</div>
            {renderTree(data.tree)}
          </>
        )}
      </div>

      <div className={s.sidebarFooter}>
        {canWrite && editUrl && (
          <button
            className={s.sidebarItem}
            onClick={() => { navigate(editUrl); onMobileClose?.(); }}
            style={{ width: '100%' }}
          >
            <FileGenericIcon />
            <span>Editar</span>
          </button>
        )}
        <button
          className={s.sidebarItem}
          onClick={() => { navigate(urlPrefix); onMobileClose?.(); }}
          style={{ width: '100%' }}
        >
          <HomeIcon />
          <span>Volver a documentos</span>
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({ file, displayName, active, favorited, onToggleFav, onClick, indent }: {
  file: string;
  displayName: string;
  active: boolean;
  favorited: boolean;
  onToggleFav: () => void;
  onClick: () => void;
  indent?: boolean;
}) {
  const isMarkdown = file.endsWith('.md');
  return (
    <button
      className={`${s.sidebarItem}${active ? ` ${s.active}` : ''}`}
      onClick={onClick}
      style={indent ? { paddingLeft: 28 } : undefined}
    >
      {isMarkdown ? <FileIcon /> : <FileGenericIcon />}
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{displayName}</span>
      <button
        type="button"
        className={s.sidebarFavBtn}
        onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
        style={{ opacity: favorited ? 0.8 : 0, color: favorited ? 'var(--accent)' : 'var(--text-muted)' }}
        aria-label={favorited ? 'Quitar de favoritos' : 'Agregar a favoritos'}
      >
        {favorited ? '★' : '☆'}
      </button>
    </button>
  );
}
