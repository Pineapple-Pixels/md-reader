import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminFetch, type PanelProps, type PaginatedResponse } from './helpers';
import type { AdminMember } from '@shared/types';

interface MembersPanelProps extends PanelProps {
  slug: string;
  onClose: () => void;
}

export function MembersPanel({ slug, toast, queryClient, onClose }: MembersPanelProps) {
  const { data: membersResponse, isLoading } = useQuery<PaginatedResponse<AdminMember>>({
    queryKey: ['admin', 'members', slug],
    queryFn: () => adminFetch(`/teams/${encodeURIComponent(slug)}/members`),
  });
  const members = membersResponse?.data ?? [];

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
