import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminFetch, type PanelProps, type PaginatedResponse } from './helpers';
import type { AdminUser } from '@shared/types';

function PasswordField({ value, onChange, required, minLength }: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  minLength?: number;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="password-field">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        minLength={minLength}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Ocultar password' : 'Mostrar password'}
        tabIndex={-1}
      >
        {show ? '\uD83D\uDE48' : '\uD83D\uDC41'}
      </button>
    </div>
  );
}

export function UsersPanel({ toast, queryClient }: PanelProps) {
  const { data: usersResponse, isLoading } = useQuery<PaginatedResponse<AdminUser>>({
    queryKey: ['admin', 'users'],
    queryFn: () => adminFetch('/users'),
  });
  const users = usersResponse?.data ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);

  const { data: invitesResponse } = useQuery<{ data: { email: string; role: string; createdAt: string }[] }>({
    queryKey: ['admin', 'invites'],
    queryFn: () => adminFetch('/invites'),
  });
  const invites = invitesResponse?.data ?? [];

  async function cancelInvite(email: string) {
    try {
      await adminFetch(`/invites/${encodeURIComponent(email)}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  async function handleDelete(username: string) {
    if (!confirm(`Quitar a "${username}" de la organizacion? Su cuenta y sus otras organizaciones no se tocan.`)) return;
    try {
      await adminFetch(`/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
      toast('Quitado de la organizacion', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error', 'error');
    }
  }

  if (isLoading) return <p className="loading-msg">Cargando usuarios...</p>;

  return (
    <div>
      <div className="admin-section-header">
        <h2>Miembros ({users.length})</h2>
        <button className="admin-btn primary" onClick={() => setShowCreate(!showCreate)}>
          {showCreate ? 'Cancelar' : '+ Invitar o crear'}
        </button>
      </div>
      {showCreate && (
        <CreateUserForm
          onCreated={(result) => {
            setShowCreate(false);
            queryClient.invalidateQueries({ queryKey: ['admin', 'users'] });
            queryClient.invalidateQueries({ queryKey: ['admin', 'invites'] });
            toast(
              result === 'invited' ? 'Invitacion creada: entra a la org la primera vez que ingrese con Google'
                : result === 'added' ? 'Ya tenia cuenta: agregado a la organizacion'
                : 'Usuario creado',
              'success',
            );
          }}
          onError={(msg) => toast(msg, 'error')}
        />
      )}
      <table className="admin-table">
        <thead>
          <tr><th>Username</th><th>Nombre</th><th>Email</th><th>Rol</th><th>Creado</th><th>Acciones</th></tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td><strong>{u.username}</strong></td>
              <td>{u.displayName || <span className="text-muted">—</span>}</td>
              <td>{u.email || <span className="text-muted">—</span>}</td>
              <td><span className={`role-badge ${u.role}`}>{u.role}</span></td>
              <td className="text-muted">{new Date(u.createdAt).toLocaleDateString('es-AR')}</td>
              <td className="admin-actions">
                <button className="admin-btn small" onClick={() => setEditingUser(editingUser === u.username ? null : u.username)}>
                  Editar
                </button>
                <button className="admin-btn small danger" onClick={() => handleDelete(u.username)}>
                  Quitar
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {invites.length > 0 && (
        <>
          <h3 style={{ margin: '20px 0 8px', fontSize: 15 }}>Invitaciones pendientes ({invites.length})</h3>
          <table className="admin-table">
            <thead><tr><th>Email</th><th>Rol</th><th>Enviada</th><th></th></tr></thead>
            <tbody>
              {invites.map((i) => (
                <tr key={i.email}>
                  <td>{i.email}</td>
                  <td><span className={`role-badge ${i.role}`}>{i.role}</span></td>
                  <td className="text-muted">{new Date(i.createdAt).toLocaleDateString('es-AR')}</td>
                  <td className="admin-actions"><button className="admin-btn small" onClick={() => cancelInvite(i.email)}>Cancelar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
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

function CreateUserForm({ onCreated, onError }: { onCreated: (result: string) => void; onError: (msg: string) => void }) {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const invite = email.trim() !== '';
    if (!invite && (!username.trim() || !password)) return;
    setSaving(true);
    try {
      const body: Record<string, string> = { role };
      // An invite is only the email; a local account never carries one (it would be unverified).
      if (invite) {
        body.email = email.trim();
      } else {
        body.username = username.trim();
        body.password = password;
      }
      if (displayName.trim()) body.displayName = displayName.trim();
      const res = await adminFetch<{ result: string }>('/users', { method: 'POST', body: JSON.stringify(body) });
      onCreated(res.result);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Error al crear');
    }
    setSaving(false);
  }

  return (
    <form className="admin-form" onSubmit={handleSubmit}>
      <div className="admin-form-row">
        <label>Email (invitacion, entra con Google)<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label>o Username (cuenta local)<input value={username} onChange={(e) => setUsername(e.target.value)} required={!email} disabled={!!email} /></label>
        <label>Password<PasswordField value={password} onChange={setPassword} required={!email} minLength={4} /></label>
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
        <label>Nueva password (dejar vacio para no cambiar)<PasswordField value={password} onChange={setPassword} minLength={4} /></label>
        <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
        <button type="button" className="admin-btn" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
