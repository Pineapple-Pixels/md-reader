import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useScope } from '../hooks/useScope';
import { useTheme } from '../hooks/useTheme';
import { useNavStore } from '../hooks/useNavStore';
import { UserIcon, TeamIcon, GlobeIcon, ChevronDownIcon, SunIcon, MoonIcon, FileIcon, HamburgerIcon } from './Icons';
import s from './Topbar.module.css';

interface TopbarProps {
  onHamburgerClick?: () => void;
}

export function Topbar({ onHamburgerClick }: TopbarProps) {
  const { scope, urlPrefix } = useScope();
  const { isAuthenticated, user, role, teams, displayName } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const openTabs = useNavStore((s) => s.openTabs);
  const closeTab = useNavStore((s) => s.closeTab);

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    queryClient.clear();
    navigate('/login', { replace: true });
  }

  const scopeIcon =
    scope.kind === 'me' ? <UserIcon /> :
    scope.kind === 'team' ? <TeamIcon /> :
    <GlobeIcon />;

  const currentLabel =
    scope.kind === 'me' ? 'Mis docs' :
    scope.kind === 'team' ? teams.find((t) => t.slug === scope.slug)?.name ?? scope.slug :
    'Publicos';

  const breadcrumbs = buildBreadcrumbs(location.pathname, urlPrefix);
  const initials = (displayName || user || '?').slice(0, 2).toUpperCase();

  return (
    <div className={s.topbar}>
      <div className={s.topbarMain}>
        <button
          type="button"
          className={s.hamburgerBtn}
          onClick={onHamburgerClick}
          aria-label="Abrir menu lateral"
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
            {scopeIcon}
            <span>{currentLabel}</span>
            <ChevronDownIcon style={{ opacity: 0.5 }} />
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
              <Link to="/pub" className={s.scopeMenuItem} role="menuitem" onClick={() => setOpen(false)}>
                Publicos
              </Link>
            </div>
          )}
        </div>

        <nav className={s.topbarBreadcrumbs} aria-label="Breadcrumbs">
          {breadcrumbs.map((crumb, i) => (
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

        <div className={s.topbarRight}>
          {isAuthenticated && role === 'admin' && (
            <Link to="/admin" className={s.topbarAdmin}>Admin</Link>
          )}
          <button
            className={s.topbarThemeBtn}
            onClick={toggle}
            aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            {isDark ? <SunIcon /> : <MoonIcon />}
          </button>
          {isAuthenticated && user && (
            <Link to="/profile" className={s.topbarUserBtn} title="Mi perfil">
              <span className={s.topbarAvatar}><span>{initials}</span></span>
              <span>{displayName || user}</span>
            </Link>
          )}
          {isAuthenticated ? (
            <button onClick={handleLogout} className={s.topbarLogout}>Salir</button>
          ) : (
            <Link to="/login" className={s.topbarLogin}>Iniciar sesion</Link>
          )}
        </div>
      </div>

      {openTabs.length > 0 && (
        <div className={s.topbarTabs}>
          {openTabs.map((file) => {
            const name = file.replace(/\.md$/i, '').split('/').pop() ?? file;
            const isActive = decodeURIComponent(location.pathname).includes(file);
            return (
              <button
                key={file}
                className={`${s.topbarTab}${isActive ? ` ${s.active}` : ''}`}
                onClick={() => navigate(`${urlPrefix}/doc/${encodeURIComponent(file)}`)}
              >
                <FileIcon size={12} />
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

  const docMatch = relative.match(/^\/(doc|edit|source)\/(.+)/);
  if (!docMatch) return crumbs;

  const [, mode, filePath] = docMatch;
  const parts = filePath.split('/');

  if (parts.length > 1) {
    crumbs.push({ label: parts[0] });
  }

  const fileName = parts[parts.length - 1].replace(/\.md$/i, '');
  if (mode === 'doc') {
    crumbs.push({ label: fileName });
  } else {
    crumbs.push({ label: fileName, href: `${urlPrefix}/doc/${encodeURIComponent(filePath)}` });
    crumbs.push({ label: mode === 'edit' ? 'editar' : 'source', isEditor: true });
  }

  return crumbs;
}
