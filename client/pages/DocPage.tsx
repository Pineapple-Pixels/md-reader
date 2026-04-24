import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { useNavStore } from '../hooks/useNavStore';
import { Toolbar, type ToolbarAction } from '../components/Toolbar';
import DOMPurify from 'dompurify';
import type { RenderResponse, Comment } from '@shared/types';

declare const hljs: { highlightAll: () => void };

export function DocPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const { isAuthenticated, role } = useAuth();
  const docRef = useRef<HTMLDivElement>(null);

  const docPrefix = `${urlPrefix}/doc/`;
  const file = decodeURIComponent(location.pathname.replace(docPrefix, ''));

  const openTab = useNavStore((s) => s.openTab);
  useEffect(() => { openTab(file); }, [file, openTab]);

  const { data, isLoading, error } = useQuery<RenderResponse>({
    queryKey: ['doc', scopeId, file],
    queryFn: () => scopedFetch(`/render?file=${encodeURIComponent(file)}`),
  });

  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canComment = isAuthenticated && (data?.canComment ?? false);

  useEffect(() => {
    if (!data?.html) return;
    const timer = setTimeout(() => {
      hljs?.highlightAll();
      docRef.current?.querySelectorAll('.doc pre').forEach((pre) => {
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
    return () => clearTimeout(timer);
  }, [data?.html]);

  const commentsByLine = useMemo(() => {
    const map: Record<number, Comment[]> = {};
    if (data?.comments) {
      for (const c of data.comments) {
        if (c.line != null) {
          if (!map[c.line]) map[c.line] = [];
          map[c.line].push(c);
        }
      }
    }
    return map;
  }, [data?.comments]);

  // Inject comment indicators after render
  useEffect(() => {
    if (!docRef.current || !data) return;
    // Clean previous indicators
    docRef.current.querySelectorAll('.doc-comment-indicator').forEach((el) => el.remove());
    docRef.current.querySelectorAll('.doc-comment-block').forEach((el) => el.remove());
    docRef.current.querySelectorAll('[data-source-line]').forEach((el) => {
      el.classList.remove('has-inline-comments', 'comment-active-block');
    });

    const elements = docRef.current.querySelectorAll<HTMLElement>('[data-source-line]');
    elements.forEach((el) => {
      const line = parseInt(el.getAttribute('data-source-line') || '0', 10);
      const lineEnd = parseInt(el.getAttribute('data-source-line-end') || '0', 10);
      if (!line) return;

      // Find comments that fall within this block's line range
      const blockComments: Comment[] = [];
      for (let l = line; l <= lineEnd; l++) {
        if (commentsByLine[l]) blockComments.push(...commentsByLine[l]);
      }

      if (blockComments.length > 0) {
        el.classList.add('has-inline-comments');
        // Add count indicator
        const badge = document.createElement('button');
        badge.className = 'doc-comment-indicator';
        badge.textContent = String(blockComments.length);
        badge.title = `${blockComments.length} comentario(s)`;
        badge.addEventListener('click', (e) => {
          e.stopPropagation();
          setActiveBlock((prev) => (prev === line ? null : line));
        });
        el.style.position = 'relative';
        el.appendChild(badge);
      }

      // Commentable block hover handler
      if (canComment) {
        el.classList.add('commentable-block');
        if (!blockComments.length) {
          const addBtn = document.createElement('button');
          addBtn.className = 'doc-comment-add';
          addBtn.textContent = '+';
          addBtn.title = 'Agregar comentario';
          addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setActiveBlock((prev) => (prev === line ? null : line));
          });
          el.style.position = 'relative';
          el.appendChild(addBtn);
        }
      }

      // Active block marker
      if (activeBlock === line) {
        el.classList.add('comment-active-block');
      }
    });
  }, [data, commentsByLine, canComment, activeBlock]);

  // Delegacion de click: tocar cualquier parte de un bloque comentable abre el
  // panel. Ignoramos clicks en elementos interactivos (links, botones inyectados,
  // inputs) para no romper la navegacion. Los handlers de los botones individuales
  // hacen stopPropagation asi que no corre dos veces.
  useEffect(() => {
    if (!canComment || !docRef.current) return;
    const container = docRef.current;
    function handler(e: Event) {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('a, button, input, textarea, select, label')) return;
      const block = target.closest<HTMLElement>('[data-source-line]');
      if (!block || !block.classList.contains('commentable-block')) return;
      const line = parseInt(block.getAttribute('data-source-line') || '0', 10);
      if (!line) return;
      setActiveBlock((prev) => (prev === line ? null : line));
    }
    container.addEventListener('click', handler);
    return () => container.removeEventListener('click', handler);
  }, [canComment, data?.html]);

  // Get comments for active block
  const activeComments: Comment[] = [];
  if (activeBlock != null && data) {
    // Find the element with this source line to get its range
    const el = docRef.current?.querySelector(`[data-source-line="${activeBlock}"]`);
    const lineEnd = parseInt(el?.getAttribute('data-source-line-end') || String(activeBlock), 10);
    for (let l = activeBlock; l <= lineEnd; l++) {
      if (commentsByLine[l]) activeComments.push(...commentsByLine[l]);
    }
  }

  async function handleAddComment() {
    if (!commentText.trim() || !activeBlock) return;
    setSubmitting(true);
    try {
      await scopedFetch('/comments', {
        method: 'POST',
        body: JSON.stringify({ file, line: activeBlock, text: commentText.trim() }),
      });
      setCommentText('');
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      toast('Comentario agregado', 'success');
    } catch {
      toast('Error al agregar comentario', 'error');
    }
    setSubmitting(false);
  }

  async function handleDeleteComment(id: string) {
    try {
      await scopedFetch('/comments/delete', {
        method: 'POST',
        body: JSON.stringify({ file, id }),
      });
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      toast('Comentario eliminado', 'success');
    } catch {
      toast('Error al eliminar comentario', 'error');
    }
  }

  async function handlePublish(overwrite = false) {
    if (!overwrite && !confirm(`Publicar "${file}" en Publicos?`)) return;
    try {
      await scopedFetch('/publish', {
        method: 'POST',
        body: JSON.stringify({ file, overwrite }),
      });
      toast(overwrite ? 'Doc republicado en Publicos' : 'Publicado en Publicos', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.includes('409')) {
        if (confirm('Ya existe un doc con ese nombre en Publicos. Sobrescribir?')) {
          await handlePublish(true);
        }
        return;
      }
      toast('Error al publicar', 'error');
    }
  }

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
    if (role === 'admin' && scope.kind !== 'public') {
      actions.push({ label: 'Publicar', onClick: () => handlePublish(false), className: 'action-btn publish-btn' });
    }
    actions.push({ label: 'Descargar', onClick: () => (window.location.href = `/api/download?scope=${encodeURIComponent(scopeParam)}&file=${encodeURIComponent(file)}`), className: 'action-btn download-btn' });
    actions.push({ label: 'Eliminar', onClick: handleDelete, className: 'action-btn delete-btn' });
  }

  return (
    <div className="container">
      <Toolbar actions={actions} />
      <div className="doc-with-comments">
        <div className="doc" ref={docRef} dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(data?.html || '') }} />
        {activeBlock != null && (
          <div className="inline-comment-panel">
            <div className="inline-comment-header">
              <span>Comentarios (linea {activeBlock})</span>
              <button className="inline-comment-close" onClick={() => setActiveBlock(null)}>&times;</button>
            </div>
            {activeComments.length === 0 && (
              <div className="inline-comment-empty">Sin comentarios en este bloque.</div>
            )}
            {activeComments.map((c) => (
              <div key={c.id} className="inline-comment-item">
                <div className="inline-comment-meta">
                  <span className="inline-comment-author">{c.author}</span>
                  <span className="inline-comment-date">{new Date(c.createdAt).toLocaleDateString('es-AR')}</span>
                  {canWrite && (
                    <button className="inline-comment-delete" onClick={() => handleDeleteComment(c.id)}>&times;</button>
                  )}
                </div>
                <div className="inline-comment-text">{c.text}</div>
              </div>
            ))}
            {canComment && (
              <div className="inline-comment-form">
                <input
                  type="text"
                  placeholder="Agregar comentario..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !submitting) handleAddComment(); }}
                  disabled={submitting}
                />
                <button onClick={handleAddComment} disabled={submitting || !commentText.trim()}>
                  {submitting ? '...' : 'Enviar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
