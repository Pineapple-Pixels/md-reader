import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { adminFetch, type PanelProps, type PaginatedResponse } from './helpers';
import { MembersPanel } from './MembersPanel';
import type { AdminTeam } from '@shared/types';

export function TeamsPanel({ toast, queryClient }: PanelProps) {
  const { data: teamsResponse, isLoading } = useQuery<PaginatedResponse<AdminTeam>>({
    queryKey: ['admin', 'teams'],
    queryFn: () => adminFetch('/teams'),
  });
  const teams = teamsResponse?.data ?? [];

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
