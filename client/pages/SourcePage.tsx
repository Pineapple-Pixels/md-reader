import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { Toolbar, type ToolbarAction } from '../components/Toolbar';
import type { Comment } from '@shared/types';

export function SourcePage() {
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const { isAuthenticated } = useAuth();

  const sourcePrefix = `${urlPrefix}/source/`;
  const file = decodeURIComponent(location.pathname.replace(sourcePrefix, ''));

  // canWrite (editar, eliminar comentarios propios) → me siempre, team miembro, public solo admin.
  // canComment → cualquier user logueado. Anonimos (public sin login) solo ven.
  const canWrite = scope.kind !== 'public';
  const canComment = isAuthenticated;

  const { data, isLoading } = useQuery<{ content: string; comments: Comment[] }>({
    queryKey: ['source', scopeId, file],
    queryFn: async () => {
      const [pullRes, commentsRes] = await Promise.all([
        scopedFetch<{ content: string }>(`/pull?file=${encodeURIComponent(file)}`),
        scopedFetch<{ data: Comment[] }>(`/comments?file=${encodeURIComponent(file)}`),
      ]);
      return { content: pullRes.content, comments: commentsRes.data };
    },
  });

  const [openForms, setOpenForms] = useState<Set<number>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});

  if (isLoading || !data) return <div className="container"><p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;

  const lines = data.content.split('\n');
  const commentsByLine: Record<number, Comment[]> = {};
  for (const c of data.comments) {
    if (c.line) {
      if (!commentsByLine[c.line]) commentsByLine[c.line] = [];
      commentsByLine[c.line].push(c);
    }
  }

  function toggleForm(line: number) {
    if (!canComment) return;
    setOpenForms((prev) => {
      const next = new Set(prev);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  }

  async function addComment(line: number) {
    const text = commentTexts[line];
    if (!text) return;
    try {
      await scopedFetch('/comments', {
        method: 'POST',
        body: JSON.stringify({ file, line, text }),
      });
      setCommentTexts((p) => ({ ...p, [line]: '' }));
      queryClient.invalidateQueries({ queryKey: ['source', scopeId, file] });
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      toast('Comentario agregado', 'success');
    } catch {
      toast('Error al agregar comentario', 'error');
    }
  }

  async function deleteComment(id: string) {
    try {
      await scopedFetch('/comments/delete', {
        method: 'POST',
        body: JSON.stringify({ file, id }),
      });
      queryClient.invalidateQueries({ queryKey: ['source', scopeId, file] });
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      toast('Comentario eliminado', 'success');
    } catch {
      toast('Error al eliminar comentario', 'error');
    }
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const docUrl = `${urlPrefix}/doc/${file}`;

  const actions: ToolbarAction[] = [
    { label: 'Volver', href: urlPrefix },
    { label: 'Ver renderizado', href: docUrl },
  ];
  if (canWrite) {
    actions.push({ label: 'Editar', href: `${urlPrefix}/edit/${file}` });
  }

  return (
    <div className="container">
      <Toolbar actions={actions} />
      <div className="source-view">
        {lines.map((line, i) => {
          const lineNum = i + 1;
          const hasComment = commentsByLine[lineNum];
          return (
            <div key={i}>
              <div className={`source-line${hasComment ? ' has-comment' : ''}`}>
                {canComment ? (
                  <button
                    type="button"
                    className="line-num"
                    onClick={() => toggleForm(lineNum)}
                    aria-label={`Comentar linea ${lineNum}`}
                    aria-expanded={openForms.has(lineNum)}
                  >
                    {lineNum}
                  </button>
                ) : (
                  <span className="line-num">{lineNum}</span>
                )}
                <span className="line-content" dangerouslySetInnerHTML={{ __html: escapeHtml(line) }} />
              </div>
              {hasComment && hasComment.map((c) => (
                <div key={c.id} className="comment-box">
                  {canWrite && (
                    <button
                      type="button"
                      className="delete-comment"
                      onClick={() => deleteComment(c.id)}
                      aria-label="Eliminar comentario"
                    >
                      &times;
                    </button>
                  )}
                  <span className="author">{c.author}</span>{' '}
                  <span className="date">{new Date(c.createdAt).toLocaleDateString('es-AR')}</span>
                  <div className="text">{c.text}</div>
                </div>
              ))}
              {canComment && openForms.has(lineNum) && (
                <div className="comment-form">
                  <input
                    type="text"
                    placeholder="Comentario..."
                    value={commentTexts[lineNum] || ''}
                    onChange={(e) => setCommentTexts((p) => ({ ...p, [lineNum]: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') addComment(lineNum); }}
                  />
                  <button onClick={() => addComment(lineNum)}>Enviar</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
