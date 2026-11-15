import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { sanitizeDocHtml } from '../sanitize';
import type { VersionEntry } from '@shared/types';
import type { DocKind } from '@shared/doc-types';
import { useScope, useScopedFetch, useScopeOrg } from '../hooks/useScope';
import { useToast } from '../hooks/useToast';
import { Toolbar } from '../components/Toolbar';
import { DocFrame } from '../components/DocFrame';

type VersionDetail = { content: string; kind: DocKind; html: string };

export function HistoryPage() {
  const location = useLocation();
  const { urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const org = useScopeOrg();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const file = decodeURIComponent(location.pathname.replace(`${urlPrefix}/history/`, ''));
  const fileParam = `file=${encodeURIComponent(file)}`;
  const [selected, setSelected] = useState<string | null>(null);

  const { data: versions = [], isLoading } = useQuery({
    queryKey: ['versions', scopeId, file],
    queryFn: () => scopedFetch<VersionEntry[]>(`/versions?${fileParam}`),
  });
  const current = selected ?? versions[0]?.id ?? null;
  const { data: detail } = useQuery({
    queryKey: ['version', scopeId, file, current],
    queryFn: () => scopedFetch<VersionDetail>(`/version?${fileParam}&id=${encodeURIComponent(current!)}`),
    enabled: current !== null,
  });

  async function restore(id: string) {
    if (!confirm('Restaurar esta version? Lo que hay ahora queda guardado en el historial.')) return;
    try {
      await scopedFetch('/versions/restore', { method: 'POST', body: JSON.stringify({ file, id }) });
      queryClient.invalidateQueries({ queryKey: ['versions', scopeId, file] });
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      toast('Version restaurada', 'success');
    } catch {
      toast('No se pudo restaurar', 'error');
    }
  }

  return (
    <div className="container">
      <Toolbar actions={[{ label: 'Volver al documento', href: `${urlPrefix}/doc/${file}` }]} />
      <h1 style={{ fontSize: '1.4em', marginBottom: 12 }}>Historial de {file.split('/').pop()}</h1>
      {isLoading ? (
        <p style={{ color: 'var(--text-muted)' }}>Cargando...</p>
      ) : versions.length === 0 ? (
        <p style={{ color: 'var(--text-muted)' }}>Todavia no hay versiones guardadas. Cada vez que guardas, la anterior queda aca.</p>
      ) : (
        <div className="history-layout">
          <ul className="history-list" aria-label="Versiones">
            {versions.map((v) => (
              <li key={v.id}>
                <button className={v.id === current ? 'active' : undefined} onClick={() => setSelected(v.id)}>
                  {new Date(v.savedAt).toLocaleString('es-AR')}
                  <span>{v.size < 1024 ? `${v.size} B` : `${(v.size / 1024).toFixed(1)} KB`}</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="history-preview">
            {current && (
              <div className="history-preview-bar">
                <button className="primary" onClick={() => void restore(current)}>Restaurar esta version</button>
              </div>
            )}
            {detail && (detail.kind === 'html' ? (
              <pre className="history-source">{detail.content}</pre>
            ) : (
              <DocFrame org={org}>
                <div className="doc" dangerouslySetInnerHTML={{ __html: sanitizeDocHtml(detail.html) }} />
              </DocFrame>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
