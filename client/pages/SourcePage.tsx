import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { useToast } from '../hooks/useToast';
import { Toolbar } from '../components/Toolbar';

interface Comment {
  id: string;
  text: string;
  line: number | null;
  author: string;
  date: string;
}

interface SourceData {
  content: string;
  comments: Comment[];
}

interface SourcePageProps {
  isPublic?: boolean;
}

export function SourcePage({ isPublic = false }: SourcePageProps) {
  const location = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const file = isPublic
    ? location.pathname.replace(/^\/pub\/source\//, '')
    : location.pathname.replace(/^\/source\//, '');

  const { data, isLoading } = useQuery<SourceData>({
    queryKey: ['source', file, isPublic],
    queryFn: async () => {
      const base = isPublic ? '/public' : '';
      const [pullRes, commentsRes] = await Promise.all([
        apiFetch<{ content: string }>(`${base}/pull?file=${encodeURIComponent(file)}`),
        apiFetch<Comment[]>(`${base}/comments?file=${encodeURIComponent(file)}`),
      ]);
      return { content: pullRes.content, comments: commentsRes };
    },
  });

  const [openForms, setOpenForms] = useState<Set<number>>(new Set());
  const [commentTexts, setCommentTexts] = useState<Record<number, string>>({});
  const [commentAuthors, setCommentAuthors] = useState<Record<number, string>>({});

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
    if (isPublic) return; // No comment forms for public view
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
    const author = commentAuthors[line] || 'Anonimo';
    await apiFetch('/comments', {
      method: 'POST',
      body: JSON.stringify({ file, line, text, author }),
    });
    setCommentTexts((p) => ({ ...p, [line]: '' }));
    queryClient.invalidateQueries({ queryKey: ['source', file] });
    toast('Comentario agregado', 'success');
  }

  async function deleteComment(id: string) {
    await apiFetch('/comments/delete', {
      method: 'POST',
      body: JSON.stringify({ file, id }),
    });
    queryClient.invalidateQueries({ queryKey: ['source', file] });
    toast('Comentario eliminado', 'success');
  }

  function escapeHtml(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const homeUrl = isPublic ? '/pub' : '/';
  const docUrl = isPublic ? `/pub/${file}` : `/doc/${file}`;

  const actions: any[] = [
    { label: 'Volver', href: homeUrl },
    { label: 'Ver renderizado', href: docUrl },
  ];
  if (!isPublic) {
    actions.push({ label: 'Editar', href: `/edit/${file}` });
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
                <span className="line-num" onClick={() => toggleForm(lineNum)}>{lineNum}</span>
                <span className="line-content" dangerouslySetInnerHTML={{ __html: escapeHtml(line) }} />
              </div>
              {hasComment && hasComment.map((c) => (
                <div key={c.id} className="comment-box">
                  {!isPublic && <button className="delete-comment" onClick={() => deleteComment(c.id)}>&times;</button>}
                  <span className="author">{c.author}</span>{' '}
                  <span className="date">{new Date(c.date).toLocaleDateString('es-AR')}</span>
                  <div className="text">{c.text}</div>
                </div>
              ))}
              {!isPublic && openForms.has(lineNum) && (
                <div className="comment-form">
                  <input
                    type="text"
                    placeholder="Tu nombre"
                    value={commentAuthors[lineNum] || 'Anonimo'}
                    onChange={(e) => setCommentAuthors((p) => ({ ...p, [lineNum]: e.target.value }))}
                  />
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
