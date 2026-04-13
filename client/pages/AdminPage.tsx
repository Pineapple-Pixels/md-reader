import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { UsersPanel } from './admin/UsersPanel';
import { TeamsPanel } from './admin/TeamsPanel';

export function AdminPage() {
  const { isAuthenticated, role, isLoading: authLoading } = useAuth();
  const { isDark, toggle } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'users' | 'teams'>('users');

  if (authLoading) return <div className="container"><p className="loading-msg">Cargando...</p></div>;
  if (!isAuthenticated || role !== 'admin') {
    return (
      <div className="container">
        <p style={{ padding: 40, textAlign: 'center', color: 'var(--danger)' }}>
          Acceso denegado. Se requiere rol admin.
        </p>
        <p style={{ textAlign: 'center' }}><Link to="/me">Volver</Link></p>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>Administracion</h1>
        <div className="admin-header-actions">
          <Link to="/me" className="admin-back">Volver a docs</Link>
          <button className="theme-toggle" onClick={toggle}>
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
        </div>
      </div>
      <div className="admin-tabs">
        <button className={`admin-tab${tab === 'users' ? ' active' : ''}`} onClick={() => setTab('users')}>Usuarios</button>
        <button className={`admin-tab${tab === 'teams' ? ' active' : ''}`} onClick={() => setTab('teams')}>Teams</button>
      </div>
      {tab === 'users' ? (
        <UsersPanel toast={toast} queryClient={queryClient} />
      ) : (
        <TeamsPanel toast={toast} queryClient={queryClient} />
      )}
    </div>
  );
}
