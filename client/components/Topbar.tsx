import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useScope } from '../hooks/useScope';
import { useTheme } from '../hooks/useTheme';

// Topbar unificada: muestra el scope actual + dropdown para cambiar, el toggle
// de tema y el boton de logout. Vive en todas las paginas via ScopeLayout.

export function Topbar() {
  const { scope } = useScope();
  const { isAuthenticated, user, teams } = useAuth();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Cierra el dropdown al clickear afuera.
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

  const currentLabel =
    scope.kind === 'me' ? 'Mis docs' :
    scope.kind === 'team' ? `Team: ${teams.find((t) => t.slug === scope.slug)?.name ?? scope.slug}` :
    'Publicos';

  return (
    <div className="topbar">
      <div className="topbar-left" ref={menuRef}>
        <button
          type="button"
          className="scope-switcher"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
        >
          <span className="scope-label">{currentLabel}</span>
          <span className="scope-chevron" aria-hidden="true">&#9662;</span>
        </button>
        {open && (
          <div className="scope-menu" role="menu">
            {isAuthenticated && (
              <Link to="/me" className="scope-menu-item" role="menuitem" onClick={() => setOpen(false)}>
                Mis docs
              </Link>
            )}
            {isAuthenticated && teams.map((t) => (
              <Link
                key={t.slug}
                to={`/t/${t.slug}`}
                className="scope-menu-item"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                Team: {t.name}
              </Link>
            ))}
            <Link to="/pub" className="scope-menu-item" role="menuitem" onClick={() => setOpen(false)}>
              Publicos
            </Link>
          </div>
        )}
      </div>

      <div className="topbar-right">
        {isAuthenticated && user && (
          <span className="topbar-user" title="Usuario actual">{user}</span>
        )}
        <button
          className="theme-toggle"
          onClick={toggle}
          aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
        >
          <span aria-hidden="true">{isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
        </button>
        {isAuthenticated ? (
          <button onClick={handleLogout} className="topbar-logout">Cerrar sesion</button>
        ) : (
          <Link to="/login" className="topbar-login">Iniciar sesion</Link>
        )}
      </div>
    </div>
  );
}

