import { useState, useCallback } from 'react';
import { Outlet, useParams, Navigate } from 'react-router-dom';
import type { Scope } from '@shared/api';
import { ScopeProvider } from '../hooks/useScope';
import { useAuth } from '../hooks/useAuth';
import { logout } from '../hooks/logout';
import { SearchModal } from './SearchModal';
import { Topbar } from './Topbar';
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
  const openMobileSidebar = useCallback(() => setMobileSidebarOpen(true), []);
  const closeMobileSidebar = useCallback(() => setMobileSidebarOpen(false), []);

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
        <Topbar onHamburgerClick={openMobileSidebar} />
        <div className={s.appBody}>
          <Sidebar mobileOpen={mobileSidebarOpen} onMobileClose={closeMobileSidebar} />
          {mobileSidebarOpen && (
            <div className={`${s.sidebarBackdrop} ${s.visible}`} onClick={closeMobileSidebar} />
          )}
          <main className={s.appMain}>
            <Outlet />
          </main>
        </div>
      </div>
      {isAuthenticated && <SearchModal />}
    </ScopeProvider>
  );
}

/** Signed in, but no organization has invited this account yet. */
function NoOrgScreen({ name }: { name: string | null }) {
  return (
    <div className="container" style={{ textAlign: 'center', paddingTop: 80 }}>
      <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Hola{name ? `, ${name}` : ''}</h1>
      <p style={{ color: 'var(--text-secondary)', maxWidth: 440, margin: '0 auto 24px' }}>
        Tu cuenta ya esta creada, pero todavia no perteneces a ninguna organizacion.
        Pedile a un admin que te invite con tu email; cuando lo haga, volve a entrar.
      </p>
      <button className="admin-btn" onClick={logout}>Salir</button>
    </div>
  );
}
