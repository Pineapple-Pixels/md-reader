import { useState, useCallback, useEffect, lazy, Suspense } from 'react';
import { Outlet, useParams, Navigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetchScoped, scopeId, type Scope } from '@shared/api';
import { docQuery } from '../hooks/useDocQuery';
import { ScopeProvider } from '../hooks/useScope';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../hooks/logout';
import { Breadcrumbs, Topbar } from './Topbar';
import { Sidebar } from './Sidebar';
import s from './Layout.module.css';

// ScopeLayout resuelve el Scope efectivo (parsea slug del url si aplica),
// valida permisos del user para ese scope y envuelve el subtree con
// ScopeProvider. Las pages hijas consumen `useScope()` en vez de derivar
// del URL cada una.

interface ScopeLayoutProps {
  kind: 'me' | 'team' | 'public';
}

export function ScopeLayout({ kind }: ScopeLayoutProps) {
  const { slug, org } = useParams<{ slug?: string; org?: string }>();
  const { isAuthenticated, isLoading, isFetching, teams, org: currentOrg, displayName, user } = useAuth();
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [sidebarHidden, setSidebarHidden] = useState(() => readSidebarHidden());
  const toggleSidebar = useCallback(() => {
    if (window.matchMedia('(max-width: 768px)').matches) {
      setMobileSidebarOpen(true);
      return;
    }
    setSidebarHidden((hidden) => {
      try { localStorage.setItem(SIDEBAR_HIDDEN_KEY, hidden ? '0' : '1'); } catch { /* storage blocked: keep it for this visit */ }
      return !hidden;
    });
  }, []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

  // A document opened by URL is requested together with the session check, not after it.
  const queryClient = useQueryClient();
  const { pathname } = useLocation();
  useEffect(() => {
    if (kind === 'public' || (kind === 'team' && !slug)) return;
    const scope: Scope = kind === 'me' ? { kind: 'me' } : { kind: 'team', slug: slug! };
    const docPrefix = `${kind === 'me' ? '/me' : `/t/${slug}`}/doc/`;
    if (!pathname.startsWith(docPrefix)) return;
    const file = decodeURIComponent(pathname.slice(docPrefix.length));
    void queryClient.prefetchQuery(docQuery((path) => apiFetchScoped(path, scope), scopeId(scope), file));
    // Only the first load waits on the session; later navigation goes through DocPage.
  }, [kind, slug]);

  // /me y /t/:slug requieren auth. /pub es accesible sin auth.
  if (kind !== 'public') {
    // isFetching (y no solo isLoading) para el caso de data cacheada stale:
    // si hay un /auth/me en vuelo revalidando la sesion, esperamos el
    // resultado en vez de rebotar a /login con el valor viejo.
    if (isLoading || (isFetching && !isAuthenticated)) {
      return <div className="container"><p className="loading-msg">Cargando...</p></div>;
    }
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    if (!currentOrg) return <NoOrgScreen name={displayName || user} />;
  }

  // Para team: validamos que el user sea miembro. Si no, redirigimos a /me.
  if (kind === 'team') {
    if (!slug) return <Navigate to="/me" replace />;
    const isMember = teams.some((t) => t.slug === slug);
    if (!isMember) return <Navigate to="/me" replace />;
  }

  const scope: Scope =
    kind === 'me' ? { kind: 'me' } :
    kind === 'team' ? { kind: 'team', slug: slug! } :
    { kind: 'public', org: org! };

  return (
    <ScopeProvider scope={scope}>
      <div className={s.appShell}>
        <Topbar onHamburgerClick={toggleSidebar} />
        <div className={`${s.appBody}${sidebarHidden ? ` ${s.sidebarHidden}` : ''}`}>
          <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={closeMobileSidebar} />
          {mobileSidebarOpen && (
            <div className={`${s.sidebarBackdrop} ${s.visible}`} onClick={closeMobileSidebar} />
          )}
          <main className={s.appMain}>
            <Breadcrumbs />
            <Suspense fallback={<div className="container"><p className="loading-msg">Cargando...</p></div>}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
      {isAuthenticated && <SearchLauncher />}
    </ScopeProvider>
  );
}

const SIDEBAR_HIDDEN_KEY = 'sidebar-hidden';

function readSidebarHidden(): boolean {
  try { return localStorage.getItem(SIDEBAR_HIDDEN_KEY) === '1'; } catch { return false; }
}

/** Signed in, but no organization has invited this account yet. */
function NoOrgScreen({ name }: { name: string | null }) {
  return (
    <div className="container" style={{ paddingTop: 80 }}>
      <p className="mono-label" style={{ paddingBottom: 8, borderBottom: '1px solid var(--text)', marginBottom: 20 }}>Sin organizacion</p>
      <h1 style={{ fontSize: 56, lineHeight: 1, marginBottom: 16 }}>Hola{name ? `, ${name}` : ''}</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 480, marginBottom: 28, fontSize: 17 }}>
        Tu cuenta ya esta creada, pero todavia no perteneces a ninguna organizacion.
        Pedile a un admin que te invite con tu email; cuando lo haga, volve a entrar.
      </p>
      <button className="admin-btn primary" onClick={logout}>Salir</button>
    </div>
  );
}

const SearchModal = lazy(() => import('./SearchModal').then((m) => ({ default: m.SearchModal })));

/** Owns the Ctrl/Cmd+K shortcut and loads the search dialog the first time it opens. */
function SearchLauncher() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);
  if (!open) return null;
  return <Suspense fallback={null}><SearchModal onClose={close} /></Suspense>;
}
