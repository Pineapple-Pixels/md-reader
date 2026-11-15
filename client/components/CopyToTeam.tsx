import { useState } from 'react';
import { ApiError } from '@shared/api';
import { useAuth } from '../hooks/useAuth';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { useToast } from '../hooks/useToast';

/** Teams of the user's organization a doc can be copied to from the current scope. */
export function useCopyTargets() {
  const { teams, org } = useAuth();
  const { scope } = useScope();
  if (!org || (scope.kind === 'public' && scope.org !== org.slug)) return [];
  return teams.filter((t) => !(scope.kind === 'team' && t.slug === scope.slug));
}

/** Panel to copy a doc or folder to another team as an independent copy. */
export function CopyToTeam({ file, onClose }: { file: string; onClose: () => void }) {
  const targets = useCopyTargets();
  const scopedFetch = useScopedFetch();
  const { toast } = useToast();
  const [to, setTo] = useState(targets[0]?.slug ?? '');
  const [busy, setBusy] = useState(false);

  async function copy(overwrite: boolean): Promise<void> {
    setBusy(true);
    try {
      const res = await scopedFetch<{ files: string[] }>('/share', {
        method: 'POST',
        body: JSON.stringify({ file, to, overwrite }),
      });
      const name = targets.find((t) => t.slug === to)?.name ?? to;
      toast(res.files.length > 1 ? `${res.files.length} documentos copiados a ${name}` : `Copiado a ${name}`, 'success');
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const n = Array.isArray(err.body?.['files']) ? (err.body['files'] as unknown[]).length : 1;
        const msg = n > 1 ? `Ya existen ${n} documentos con esos nombres en el equipo.` : 'Ya existe un documento con ese nombre en el equipo.';
        if (confirm(`${msg} Reemplazar? Lo anterior queda en su historial.`)) await copy(true);
      } else {
        toast('No se pudo copiar', 'error');
      }
    }
    setBusy(false);
  }

  return (
    <div className="editor-banner" role="dialog" aria-label="Copiar a equipo">
      <label htmlFor="copy-to-team">Copiar a</label>
      <select id="copy-to-team" value={to} onChange={(e) => setTo(e.target.value)}>
        {targets.map((t) => <option key={t.slug} value={t.slug}>{t.name}</option>)}
      </select>
      <button className="primary" disabled={!to || busy} onClick={() => void copy(false)}>Copiar</button>
      <button onClick={onClose}>Cancelar</button>
      <span className="editor-banner-note">Es una copia independiente: los cambios no se sincronizan.</span>
    </div>
  );
}
