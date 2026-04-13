import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminFetch, type PanelProps } from './helpers';
import type { AdminUser } from '@shared/types';

export function UsersPanel({ toast, queryClient }: PanelProps) {
  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
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
  user: AdminUser;
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
