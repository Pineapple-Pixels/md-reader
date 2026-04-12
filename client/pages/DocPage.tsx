import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { Toolbar, type ToolbarAction } from '../components/Toolbar';

declare const hljs: { highlightAll: () => void };

interface DocData {
  html: string;
  commentCount: number;
  canWrite?: boolean;
  canComment?: boolean;
}

export function DocPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  // El path del archivo viene despues del prefix del scope + "/doc/".
  // Ej: `/me/doc/foo/bar.md` → file = 'foo/bar.md'.
  const docPrefix = `${urlPrefix}/doc/`;
  const file = decodeURIComponent(location.pathname.replace(docPrefix, ''));

  const { data, isLoading, error } = useQuery<DocData>({
    queryKey: ['doc', scopeId, file],
    queryFn: () => scopedFetch(`/render?file=${encodeURIComponent(file)}`),
  });

  useEffect(() => {
    if (data?.html) {
      setTimeout(() => {
        hljs?.highlightAll();
        document.querySelectorAll('.doc pre').forEach((pre) => {
          if (pre.querySelector('.copy-btn')) return;
          const btn = document.createElement('button');
          btn.className = 'copy-btn';
          btn.textContent = 'Copiar';
          btn.addEventListener('click', async () => {
            const code = pre.querySelector('code');
            if (!code) return;
            try {
              await navigator.clipboard.writeText(code.textContent || '');
              btn.textContent = 'Copiado!';
              setTimeout(() => (btn.textContent = 'Copiar'), 2000);
            } catch {
              btn.textContent = 'Error';
              setTimeout(() => (btn.textContent = 'Copiar'), 2000);
            }
          });
          pre.appendChild(btn);
        });
      }, 0);
    }
  }, [data?.html]);

  async function handleDelete() {
    if (!confirm('Eliminar este documento?')) return;
    try {
      const res = await scopedFetch<{ ok: boolean }>('/delete', {
        method: 'DELETE',
        body: JSON.stringify({ file }),
      });
      if (res.ok) {
        toast('Documento eliminado', 'success');
        queryClient.invalidateQueries({ queryKey: ['docs', scopeId] });
        navigate(urlPrefix);
      }
    } catch {
      toast('Error al eliminar', 'error');
    }
  }

  if (isLoading) return <div className="container"><p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;
  if (error) return <div className="container"><p style={{ color: 'var(--danger)' }}>Error al cargar el documento.</p></div>;

  const canWrite = data?.canWrite ?? false;
  const sourceUrl = `${urlPrefix}/source/${file}`;
  const commentLabel = `Codigo fuente${data?.commentCount ? ` (${data.commentCount})` : ''}`;

  const actions: ToolbarAction[] = [
    { label: 'Volver', href: urlPrefix },
    { label: commentLabel, href: sourceUrl },
  ];

  if (canWrite) {
    const scopeParam =
      scope.kind === 'me' ? 'me' :
      scope.kind === 'team' ? `team:${scope.slug}` :
      'public';
    actions.push({ label: 'Editar', href: `${urlPrefix}/edit/${file}`, primary: true });
    actions.push({ label: 'Descargar', onClick: () => (window.location.href = `/api/download?scope=${encodeURIComponent(scopeParam)}&file=${encodeURIComponent(file)}`), className: 'action-btn download-btn' });
    actions.push({ label: 'Eliminar', onClick: handleDelete, className: 'action-btn delete-btn' });
  }

  return (
    <div className="container">
      <Toolbar actions={actions} />
      <div className="doc" dangerouslySetInnerHTML={{ __html: data?.html || '' }} />
    </div>
  );
}
