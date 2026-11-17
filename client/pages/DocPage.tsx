import { DocFrame } from '../components/DocFrame';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../hooks/useAuth';
import { useScope, useScopedFetch, useScopedUrl, useScopeOrg } from '../hooks/useScope';
import { CopyToTeam, useCopyTargets } from '../components/CopyToTeam';
import { HtmlFrame } from '../components/HtmlFrame';
import { ArchiveIcon, ArrowLeftIcon, ClockIcon, CodeIcon, CommentAddIcon, DownloadIcon, PencilIcon, ShareIcon, TrashIcon } from '../components/Icons';
import { isMarkdownKind } from '@shared/doc-types';
import { ApiError } from '@shared/api';
import { useNavStore } from '../hooks/useNavStore';
import { docQuery } from '../hooks/useDocQuery';
import { Toolbar, type ToolbarAction, type ToolbarItem } from '../components/Toolbar';
import { sanitizeDocHtml } from '../sanitize';
import { highlightCode } from '../highlight';
import type { RenderResponse, Comment } from '@shared/types';

export function DocPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { scope, urlPrefix, id: scopeId } = useScope();
  const org = useScopeOrg();
  const scopedFetch = useScopedFetch();
  const scopedUrl = useScopedUrl();
  const copyTargets = useCopyTargets();
  const [copying, setCopying] = useState(false);
  const { isAuthenticated, role } = useAuth();
  const docRef = useRef<HTMLDivElement>(null);

  const docPrefix = `${urlPrefix}/doc/`;
  const file = decodeURIComponent(location.pathname.replace(docPrefix, ''));

  const openTab = useNavStore((s) => s.openTab);
  const forget = useNavStore((s) => s.forget);
  useEffect(() => { openTab(file); }, [file, openTab]);

  const { data, isLoading, error } = useQuery<RenderResponse>(docQuery(scopedFetch, scopeId, file));

  const [activeBlock, setActiveBlock] = useState<number | null>(null);
  const [commentText, setCommentText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const canComment = isAuthenticated && (data?.canComment ?? false);

  useEffect(() => {
    if (!data?.html) return;
    const stopHighlight = highlightCode(docRef.current);
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
    return stopHighlight;
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
    docRef.current.querySelectorAll('.has-inline-comments').forEach((el) => el.classList.remove('has-inline-comments'));

    const elements = docRef.current.querySelectorAll<HTMLElement>('[data-source-line]');
    elements.forEach((el) => {
      const line = parseInt(el.getAttribute('data-source-line') || '0', 10);
      const lineEnd = parseInt(el.getAttribute('data-source-line-end') || '0', 10);
      if (!line) return;
      // Code fences carry the line on <code>; buttons placed there become text once highlight.js re-renders it.
      const host = el.tagName === 'CODE' && el.parentElement?.tagName === 'PRE' ? el.parentElement : el;

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
        host.style.position = 'relative';
        host.appendChild(badge);
      }
    });
  }, [data, commentsByLine]);

  useEffect(() => {
    if (activeBlock == null) return;
    const el = docRef.current?.querySelector(`[data-source-line="${activeBlock}"]`);
    el?.classList.add('comment-active-block');
    return () => el?.classList.remove('comment-active-block');
  }, [activeBlock, data]);

  // Selecting text offers "Añadir comentario" for its block, like Google Docs; Ctrl+Alt+M does the same.
  const [selection, setSelection] = useState<SelectedBlock | null>(null);
  useEffect(() => {
    if (!canComment) return;
    let frame = 0;
    function onSelectionChange() {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setSelection(selectedBlock(docRef.current)));
    }
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.ctrlKey && e.altKey && e.code === 'KeyM')) return;
      const block = selectedBlock(docRef.current);
      if (!block) return;
      e.preventDefault();
      openComments(block.line);
    }
    document.addEventListener('selectionchange', onSelectionChange);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('selectionchange', onSelectionChange);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [canComment, data?.html]);

  function openComments(line: number) {
    setActiveBlock(line);
    setSelection(null);
    window.getSelection()?.removeAllRanges();
  }

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

  async function handleArchive() {
    try {
      await scopedFetch('/archive', { method: 'POST', body: JSON.stringify({ file }) });
      forget(file);
      toast('Archivado. Lo podes restaurar desde Archivados', 'success');
      queryClient.invalidateQueries({ queryKey: ['docs', scopeId] });
      queryClient.invalidateQueries({ queryKey: ['archived', scopeId] });
      navigate(urlPrefix);
    } catch (err) {
      toast(err instanceof ApiError && err.status === 409 ? 'Ya hay un archivado con ese nombre' : 'Error al archivar', 'error');
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

  const fileParam = `?file=${encodeURIComponent(file)}`;
  const markdownLike = isMarkdownKind(file);
  const actions: ToolbarAction[] = [
    { label: 'Volver', href: urlPrefix, icon: <ArrowLeftIcon /> },
    { label: commentLabel, href: sourceUrl, icon: <CodeIcon />, badge: data?.commentCount },
  ];

  if (canWrite) {
    actions.push({ label: 'Editar', href: `${urlPrefix}/edit/${file}`, primary: true, icon: <PencilIcon size={16} /> });
    actions.push({ label: 'Historial', href: `${urlPrefix}/history/${file}`, icon: <ClockIcon /> });
  }
  const exportItems: ToolbarItem[] = [];
  if (markdownLike) {
    exportItems.push({ label: 'PDF', onClick: () => window.print() });
    exportItems.push({ label: 'Word', onClick: () => (window.location.href = scopedUrl(`/export/docx${fileParam}`)) });
  }
  if (canWrite) {
    exportItems.push({ label: 'Archivo original', onClick: () => (window.location.href = scopedUrl(`/download${fileParam}`)) });
  }
  actions.push({ label: 'Exportar', menu: exportItems, icon: <DownloadIcon /> });
  const shareItems: ToolbarItem[] = [];
  if (isAuthenticated && copyTargets.length > 0) {
    shareItems.push({ label: 'Copiar a equipo', onClick: () => setCopying(true) });
  }
  if (canWrite && role === 'admin' && scope.kind !== 'public') {
    shareItems.push({ label: 'Publicar en Publicos', onClick: () => handlePublish(false) });
  }
  actions.push({ label: 'Compartir', menu: shareItems, icon: <ShareIcon /> });
  // The index of the public scope has no Archivados list, so archiving stays in me/team.
  if (canWrite && scope.kind !== 'public') {
    actions.push({ label: 'Archivar', onClick: handleArchive, icon: <ArchiveIcon /> });
  }
  if (canWrite) {
    actions.push({ label: 'Eliminar', onClick: handleDelete, className: 'delete-btn', icon: <TrashIcon /> });
  }
  const origin = data?.origin;

  return (
    <div className="container">
      <Toolbar actions={actions} />
      {copying && <CopyToTeam file={file} onClose={() => setCopying(false)} />}
      {origin && (
        <p className="doc-origin">
          Copiado de {origin.fromLabel}{origin.by ? ` por ${origin.by}` : ''} el {new Date(origin.at).toLocaleDateString('es-AR')}
        </p>
      )}
      <div className="doc-with-comments">
        {data?.kind === 'html' ? (
          <HtmlFrame src={scopedUrl(`/frame${fileParam}`)} title={file} />
        ) : (
          <DocFrame org={org}>
            <div className="doc" ref={docRef} dangerouslySetInnerHTML={{ __html: sanitizeDocHtml(data?.html || '') }} />
          </DocFrame>
        )}
        {selection && activeBlock == null && (
          <button
            type="button"
            className="icon-btn doc-comment-float"
            style={{ top: selection.top, left: selection.left }}
            aria-label="Añadir comentario"
            data-tip="Añadir comentario"
            // Keeps the selection alive until the click lands.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => openComments(selection.line)}
          >
            <CommentAddIcon />
          </button>
        )}
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
                  autoFocus
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

type SelectedBlock = { line: number; top: number; left: number };

/** The block where the text selection starts, and where to float the comment button inside `.doc-with-comments`. */
function selectedBlock(container: HTMLElement | null): SelectedBlock | null {
  const sel = window.getSelection();
  if (!container || !sel || sel.isCollapsed || sel.rangeCount === 0 || !sel.toString().trim()) return null;
  const range = sel.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  const start = range.startContainer;
  const block = (start instanceof Element ? start : start.parentElement)?.closest<HTMLElement>('[data-source-line]');
  const line = parseInt(block?.getAttribute('data-source-line') ?? '0', 10);
  const host = container.closest('.doc-with-comments');
  if (!block || !line || !host) return null;
  const rects = range.getClientRects();
  const last = rects[rects.length - 1] ?? range.getBoundingClientRect();
  const box = host.getBoundingClientRect();
  // Client rects are viewport pixels; the page content is scaled by --z.
  const z = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--z')) || 1;
  return {
    line,
    top: (last.bottom - box.top) / z + 6,
    left: Math.min(Math.max(last.right - box.left, 0), box.width - 40) / z,
  };
}
