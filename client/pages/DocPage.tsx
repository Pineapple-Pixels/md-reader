import { useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { useToast } from '../hooks/useToast';
import { Toolbar } from '../components/Toolbar';

declare const hljs: { highlightAll: () => void };

interface DocData {
  html: string;
  commentCount: number;
  isFilePublic: boolean;
}

interface DocPageProps {
  isPublic?: boolean;
}

export function DocPage({ isPublic = false }: DocPageProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Extract file path from URL: /doc/some/file.md or /pub/some/file.md
  // decodeURIComponent needed because location.pathname is percent-encoded by the browser
  const file = isPublic
    ? decodeURIComponent(location.pathname.replace(/^\/pub\//, ''))
    : decodeURIComponent(location.pathname.replace(/^\/doc\//, ''));

  const apiUrl = isPublic ? `/public/render?file=${encodeURIComponent(file)}` : `/render?file=${encodeURIComponent(file)}`;

  const { data, isLoading, error } = useQuery<DocData>({
    queryKey: ['doc', file, isPublic],
    queryFn: () => apiFetch(apiUrl),
  });

  useEffect(() => {
    if (data?.html) {
      setTimeout(() => {
        hljs?.highlightAll();
        // Add copy buttons to code blocks
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
      const res = await apiFetch<{ ok: boolean }>('/delete', {
        method: 'DELETE',
        body: JSON.stringify({ file }),
      });
      if (res.ok) {
        toast('Documento eliminado', 'success');
        navigate('/');
      }
    } catch {
      toast('Error al eliminar', 'error');
    }
  }

  async function handleToggleVis() {
    try {
      const res = await apiFetch<{ ok: boolean; public: boolean }>('/toggle-visibility', {
        method: 'POST',
        body: JSON.stringify({ file }),
      });
      if (res.ok) {
        toast(res.public ? 'Ahora es publico' : 'Ahora es privado', 'success');
        queryClient.invalidateQueries({ queryKey: ['doc', file] });
      }
    } catch {
      toast('Error al cambiar visibilidad', 'error');
    }
  }

  if (isLoading) return <div className="container"><p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;
  if (error) return <div className="container"><p style={{ color: 'var(--danger)' }}>Error al cargar el documento.</p></div>;

  const homeUrl = isPublic ? '/pub' : '/';
  const sourceUrl = isPublic ? `/pub/source/${file}` : `/source/${file}`;
  const commentLabel = `Codigo fuente${data?.commentCount ? ` (${data.commentCount})` : ''}`;

  const actions = [
    { label: 'Volver', href: homeUrl },
    { label: commentLabel, href: sourceUrl },
  ];

  if (!isPublic) {
    actions.push({ label: 'Editar', href: `/edit/${file}`, primary: true } as any);
    actions.push({ label: 'Descargar', onClick: () => (window.location.href = `/api/download?file=${encodeURIComponent(file)}`), className: 'action-btn download-btn' } as any);
    actions.push({ label: data?.isFilePublic ? 'Publico' : 'Privado', onClick: handleToggleVis, className: `action-btn ${data?.isFilePublic ? 'publish-btn' : ''}` } as any);
    actions.push({ label: 'Eliminar', onClick: handleDelete, className: 'action-btn delete-btn' } as any);
  }

  return (
    <div className="container">
      <Toolbar actions={actions} />
      <div className="doc" dangerouslySetInnerHTML={{ __html: data?.html || '' }} />
    </div>
  );
}
