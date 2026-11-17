import { stripDocExt } from '@shared/doc-types';
import { useState, useRef, useEffect, type RefObject } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useScope } from '../hooks/useScope';
import { useTheme } from '../hooks/useTheme';
import { logout } from '../hooks/logout';
import { useNavStore } from '../hooks/useNavStore';
import { ChevronDownIcon, HamburgerIcon, MoonIcon, SunIcon, UserIcon } from './Icons';
import s from './Topbar.module.css';

interface TopbarProps {
  onHamburgerClick?: () => void;
}

export function Topbar({ onHamburgerClick }: TopbarProps) {
  const { scope, urlPrefix } = useScope();
  const { isAuthenticated, user, role, teams, displayName, org, orgs } = useAuth();
  const publicOrg = scope.kind === 'public' ? scope.org : org?.slug;
  // Another org's public pages are labelled with that org, not the viewer's.
  const orgLabel = scope.kind === 'public' && scope.org !== org?.slug ? scope.org : org?.name;
  const { themes, active, setActive, isDark, toggle } = useTheme();
  const themeLabel = isDark ? 'Pasar a tema claro' : 'Pasar a tema oscuro';
  const navigate = useNavigate();
  const location = useLocation();

  const openTabs = useNavStore((s) => s.openTabs);
  const closeTab = useNavStore((s) => s.closeTab);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useDismiss(menuRef, open, () => setOpen(false));
  const [userOpen, setUserOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  useDismiss(userMenuRef, userOpen, () => setUserOpen(false));

  async function switchOrg(slug: string) {
    setOpen(false);
    const res = await fetch('/api/auth/switch-org', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug }),
    });
    // Full reload: every cached query (docs, teams, design) belongs to the previous org.
    if (res.ok) window.location.assign('/me');
  }

  const currentLabel =
    scope.kind === 'me' ? 'Mis docs' :
    scope.kind === 'team' ? teams.find((t) => t.slug === scope.slug)?.name ?? scope.slug :
    'Publicos';

  const initials = (displayName || user || '?').slice(0, 2).toUpperCase();

  return (
    <div className={s.topbar} data-noprint>
      <div className={s.topbarMain}>
        <button
          type="button"
          className={s.hamburgerBtn}
          onClick={onHamburgerClick}
          aria-label="Mostrar u ocultar menu lateral"
        >
          <HamburgerIcon />
        </button>
        <div className={s.topbarLeft} ref={menuRef}>
          <button
            type="button"
            className={s.scopeSwitcher}
            onClick={() => setOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <span>{orgLabel ? `${orgLabel} · ${currentLabel}` : currentLabel}</span>
            <ChevronDownIcon size={12} aria-hidden="true" />
          </button>
          {open && (
            <div className={s.scopeMenu} role="menu">
              {isAuthenticated && (
                <Link to="/me" className={s.scopeMenuItem} role="menuitem" onClick={() => setOpen(false)}>
                  Mis docs
                </Link>
              )}
              {isAuthenticated && teams.map((t) => (
                <Link key={t.slug} to={`/t/${t.slug}`} className={s.scopeMenuItem} role="menuitem" onClick={() => setOpen(false)}>
                  {t.name}
                </Link>
              ))}
              {publicOrg && (
                <Link to={`/pub/${publicOrg}`} className={s.scopeMenuItem} role="menuitem" onClick={() => setOpen(false)}>
                  Publicos
                </Link>
              )}
              {orgs.filter((o) => o.slug !== org?.slug).map((o) => (
                <button key={o.slug} type="button" className={s.scopeMenuItem} role="menuitem" onClick={() => switchOrg(o.slug)}>
                  Cambiar a {o.name}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className={s.topbarSpacer} />

        <div className={s.topbarRight} ref={userMenuRef}>
          <button type="button" className={`${s.themeBtn} theme-toggle`} onClick={toggle} aria-label={themeLabel} data-tip={themeLabel}>
            {isDark ? <SunIcon size={18} aria-hidden="true" /> : <MoonIcon size={18} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={s.userBtn}
            onClick={() => setUserOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={userOpen}
            aria-label="Menu de usuario"
          >
            {isAuthenticated && user ? initials : <UserIcon size={16} />}
          </button>
          {userOpen && (
            <div className={s.userMenu} role="menu">
              {isAuthenticated && user && (
                <div className={s.userMenuHeader}>
                  <strong>{displayName || user}</strong>
                  {role && <span>Rol: {role === 'admin' ? 'Admin' : 'Miembro'}</span>}
                </div>
              )}
              {isAuthenticated && (
                <Link to="/profile" className={s.userMenuItem} role="menuitem" onClick={() => setUserOpen(false)}>Mi perfil</Link>
              )}
              {isAuthenticated && role === 'admin' && (
                <Link to="/admin" className={s.userMenuItem} role="menuitem" onClick={() => setUserOpen(false)}>Administración</Link>
              )}
              <label className={s.userMenuTheme} title="No cambia los documentos">
                <span>Tema</span>
                <select value={active.id} onChange={(e) => setActive(e.target.value)} aria-label="Tema de la app">
                  {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </label>
              {isAuthenticated ? (
                <button type="button" className={s.userMenuItem} role="menuitem" onClick={logout}>Cerrar sesion</button>
              ) : (
                <Link to="/login" className={s.userMenuItem} role="menuitem" onClick={() => setUserOpen(false)}>Iniciar sesion</Link>
              )}
            </div>
          )}
        </div>
      </div>

      {openTabs.length > 0 && (
        <div className={s.topbarTabs}>
          {openTabs.map((file) => {
            const name = stripDocExt(file).split('/').pop() ?? file;
            const isActive = decodeURIComponent(location.pathname).includes(file);
            return (
              <button
                key={file}
                className={`${s.topbarTab}${isActive ? ` ${s.active}` : ''}`}
                onClick={() => navigate(`${urlPrefix}/doc/${encodeURIComponent(file)}`)}
              >
                <span>{name}</span>
                <span
                  className={s.topbarTabClose}
                  onClick={(e) => { e.stopPropagation(); closeTab(file); }}
                  role="button"
                  aria-label={`Cerrar ${name}`}
                >
                  ×
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** The current location, shown above the page content; hidden on a scope's root. */
export function Breadcrumbs() {
  const { urlPrefix } = useScope();
  const location = useLocation();
  const crumbs = buildBreadcrumbs(location.pathname, urlPrefix);
  if (crumbs.length < 2) return null;
  return (
    <nav className={s.breadcrumbs} aria-label="Breadcrumbs" data-noprint>
      {crumbs.map((crumb, i) => (
        <span key={i}>
          {i > 0 && <span className={s.sep}>/</span>}
          {crumb.href ? (
            <Link to={crumb.href}>{crumb.label}</Link>
          ) : crumb.isEditor ? (
            <span className={s.editorHint}>{crumb.label}</span>
          ) : (
            <span className={s.current}>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** Closes a menu on a click outside `ref` or on Escape. */
function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [ref, open, close]);
}

interface Crumb {
  label: string;
  href?: string;
  isEditor?: boolean;
}

function buildBreadcrumbs(pathname: string, urlPrefix: string): Crumb[] {
  const crumbs: Crumb[] = [];
  const decoded = decodeURIComponent(pathname);
  const relative = decoded.replace(urlPrefix, '');

  crumbs.push({ label: 'docs', href: urlPrefix });

  const projectMatch = relative.match(/^\/project\/([^/]+)/);
  if (projectMatch) {
    crumbs.push({ label: projectMatch[1]! });
    return crumbs;
  }

  const docMatch = relative.match(/^\/(doc|edit|source)\/(.+)/);
  if (!docMatch) return crumbs;

  const [, mode, filePath] = docMatch;
  const parts = filePath.split('/');

  if (parts.length > 1) {
    crumbs.push({ label: parts[0], href: `${urlPrefix}/project/${encodeURIComponent(parts[0])}` });
  }

  const fileName = stripDocExt(parts[parts.length - 1]);
  if (mode === 'doc') {
    crumbs.push({ label: fileName });
  } else {
    crumbs.push({ label: fileName, href: `${urlPrefix}/doc/${encodeURIComponent(filePath)}` });
    crumbs.push({ label: mode === 'edit' ? 'editar' : 'source', isEditor: true });
  }

  return crumbs;
}
