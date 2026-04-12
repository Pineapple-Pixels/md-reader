import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';

interface UserItem {
  id: number;
  username: string;
  displayName: string | null;
  role: 'admin' | 'member';
  createdAt: string;
}

interface TeamItem {
  id: number;
  slug: string;
  name: string;
  createdAt: string;
}

interface MemberItem {
  username: string;
  role: 'admin' | 'member';
}

function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  return apiFetch<T>(`/admin${path}`, init);
}

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

// ===== USERS PANEL =====

function UsersPanel({ toast, queryClient }: { toast: (msg: string, type?: 'success' | 'error' | 'info') => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: users = [], isLoading } = useQuery<UserItem[]>({
    queryKey: ['admin', 'users'],
    queryFn: () => adminFetch('/users'),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  async function handleDelete(username: string) {
    if (!confirm(`Eliminar usuario "${username}"?`)) return;
    try {
      await adminFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast('Usuario eliminado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  if (isLoading) return <p className="loading-msg">Cargando usuarios...</p>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Usuarios ({users.length})</h2>
        <button className="admin-btn primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancelar' : '+ Crear usuario'}
        </button>
      </div>
      {showCreate && (
        <CreateUserForm
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast('Usuario creado', 'success');
          }}
          onError={(msg) => toast(msg, 'error')}
        />
      )}
      <table className="admin-table">
        <thead>
          <tr><th>Username</th><th>Nombre</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td>{u.displayName || <span className="text-muted">—</span>}</td>
              <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
              <td className="text-muted">{new Date(u.createdAt).toLocaleDateString('es-AR')}</td>
              <td className="admin-actions">
                <button className="admin-btn small" onClick={() => setEditingUser(editingUser === u.username ? null : u.username)}>
                  Editar
                </button>
                <button className="admin-btn small danger" onClick={() => handleDelete(u.username)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editingUser && (
        <EditUserForm
          username={editingUser}
          user={users.find((u) => u.username === editingUser)!}
          onSaved={() => {
            setEditingUser(null);
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            toast('Usuario actualizado', 'success');
          }}
          onError={(msg) => toast(msg, 'error')}
          onCancel={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

function CreateUserForm({ onCreated, onError }: { onCreated: () => void; onError: (msg: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { username: username.trim(), password, role };
      if (displayName.trim()) body.displayName = displayName.trim();
      await adminFetch('/users', { method: 'POST', body: JSON.stringify(body) });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al crear');
    }
    setSaving(false);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-form-row">
        <label>Username<input value={username} onChange={(e) => setUsername(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} /></label>
        <label>Nombre (opcional)<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>Rol
          <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Creando...' : 'Crear'}</button>
      </div>
    </form>
  );
}

function EditUserForm({ username, user, onSaved, onError, onCancel }: {
  username: string;
  user: UserItem;
  onSaved: () => void;
  onError: (msg: string) => void;
  onCancel: () => void;
}) {
  const [role, setRole] = useState(user.role);
  const [displayName, setDisplayName] = useState(user.displayName || '');
  const [password, setPassword] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (role !== user.role) body.role = role;
      if (displayName.trim() !== (user.displayName || '')) body.displayName = displayName.trim();
      if (password) body.password = password;
      if (Object.keys(body).length === 0) { onCancel(); return; }
      await adminFetch(`/users/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      onSaved();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al actualizar');
    }
    setSaving(false);
  }

  return (
    <form className="admin-form edit-form" onSubmit={handleSubmit}>
      <h3>Editar: {username}</h3>
      <div className="admin-form-row">
        <label>Rol
          <select value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
            <option value="member">member</option>
            <option value="admin">admin</option>
          </select>
        </label>
        <label>Nombre<input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></label>
        <label>Nueva password (dejar vacio para no cambiar)<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={4} /></label>
        <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="admin-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}

// ===== TEAMS PANEL =====

function TeamsPanel({ toast, queryClient }: { toast: (msg: string, type?: 'success' | 'error' | 'info') => void; queryClient: ReturnType<typeof useQueryClient> }) {
  const { data: teams = [], isLoading } = useQuery<TeamItem[]>({
    queryKey: ['admin', 'teams'],
    queryFn: () => adminFetch('/teams'),
  });

  const [showCreate, setShowCreate] = useState(false);
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);

  async function handleDelete(slug: string) {
    if (!confirm(`Eliminar team "${slug}"? Se eliminaran todas las memberships.`)) return;
    try {
      await adminFetch(`/teams/${encodeURIComponent(slug)}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'members'] });
      toast('Team eliminado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  if (isLoading) return <p className="loading-msg">Cargando teams...</p>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Teams ({teams.length})</h2>
        <button className="admin-btn primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancelar' : '+ Crear team'}
        </button>
      </div>
      {showCreate && (
        <CreateTeamForm
          onCreated={() => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'teams'] });
            toast('Team creado', 'success');
          }}
          onError={(msg) => toast(msg, 'error')}
        />
      )}
      <table className="admin-table">
        <thead>
          <tr><th>Slug</th><th>Nombre</th><th>Creado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {teams.map((t) => (
            <tr key={t.id}>
              <td><strong>{t.slug}</strong></td>
              <td>{t.name}</td>
              <td className="text-muted">{new Date(t.createdAt).toLocaleDateString('es-AR')}</td>
              <td className="admin-actions">
                <button className="admin-btn small" onClick={() => setExpandedTeam(expandedTeam === t.slug ? null : t.slug)}>
                  Miembros
                </button>
                <button className="admin-btn small danger" onClick={() => handleDelete(t.slug)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {expandedTeam && (
        <MembersPanel slug={expandedTeam} toast={toast} queryClient={queryClient} onClose={() => setExpandedTeam(null)} />
      )}
    </div>
  );
}

function CreateTeamForm({ onCreated, onError }: { onCreated: () => void; onError: (msg: string) => void }) {
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug.trim() || !name.trim()) return;
    setSaving(true);
    try {
      await adminFetch('/teams', { method: 'POST', body: JSON.stringify({ slug: slug.trim(), name: name.trim() }) });
      onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al crear');
    }
    setSaving(false);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-form-row">
        <label>Slug<input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="mi-team" required pattern="[a-z0-9][a-z0-9-]*" /></label>
        <label>Nombre<input value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Creando...' : 'Crear'}</button>
      </div>
    </form>
  );
}

// ===== MEMBERS PANEL =====

function MembersPanel({ slug, toast, queryClient, onClose }: {
  slug: string;
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void;
  queryClient: ReturnType<typeof useQueryClient>;
  onClose: () => void;
}) {
  const { data: members = [], isLoading } = useQuery<MemberItem[]>({
    queryKey: ['admin', 'members', slug],
    queryFn: () => adminFetch(`/teams/${encodeURIComponent(slug)}/members`),
  });

  const [addUsername, setAddUsername] = useState('');
  const [addRole, setAddRole] = useState<'member' | 'admin'>('member');

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addUsername.trim()) return;
    try {
      await adminFetch(`/teams/${encodeURIComponent(slug)}/members`, {
        method: 'POST',
        body: JSON.stringify({ username: addUsername.trim(), role: addRole }),
      });
      setAddUsername('');
      queryClient.invalidateQueries({ queryKey: ['admin', 'members', slug] });
      toast('Miembro agregado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  async function handleRemove(username: string) {
    try {
      await adminFetch(`/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'members', slug] });
      toast('Miembro removido', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  async function handleChangeRole(username: string, newRole: 'admin' | 'member') {
    try {
      await adminFetch(`/teams/${encodeURIComponent(slug)}/members/${encodeURIComponent(username)}`, {
        method: 'PATCH',
        body: JSON.stringify({ role: newRole }),
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'members', slug] });
      toast('Rol actualizado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  return (
    <div className="admin-members-panel">
      <div className="admin-members-header">
        <h3>Miembros de "{slug}"</h3>
        <button className="admin-btn small" onClick={onClose}>Cerrar</button>
      </div>
      {isLoading ? (
        <p className="loading-msg">Cargando...</p>
      ) : members.length === 0 ? (
        <p className="text-muted" style={{ padding: '8px 0' }}>Sin miembros</p>
      ) : (
        <table className="admin-table compact">
          <thead><tr><th>Username</th><th>Rol</th><th>Acciones</th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.username}>
                <td>{m.username}</td>
                <td>
                  <select
                    value={m.role}
                    onChange={(e) => handleChangeRole(m.username, e.target.value as 'admin' | 'member')}
                    className="admin-select-inline"
                  >
                    <option value="member">member</option>
                    <option value="admin">admin</option>
                  </select>
                </td>
                <td>
                  <button className="admin-btn small danger" onClick={() => handleRemove(m.username)}>Quitar</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <form className="admin-add-member" onSubmit={handleAdd}>
        <input value={addUsername} onChange={(e) => setAddUsername(e.target.value)} placeholder="Username" required />
        <select value={addRole} onChange={(e) => setAddRole(e.target.value as 'member' | 'admin')}>
          <option value="member">member</option>
          <option value="admin">admin</option>
        </select>
        <button type="submit" className="admin-btn primary small">Agregar</button>
      </form>
    </div>
  );
}
