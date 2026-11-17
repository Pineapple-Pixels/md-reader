import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@shared/api';
import type { PullResponse } from '@shared/types';
import { useToast } from '../hooks/useToast';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { useNavStore } from '../hooks/useNavStore';
import { Toolbar } from '../components/Toolbar';
import { ArrowLeftIcon, SaveIcon } from '../components/Icons';

type Draft = { content: string; baseHash: string; savedAt: string };
type Conflict = 'changed' | 'deleted';

function readDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<Draft>;
    return typeof d.content === 'string' && typeof d.baseHash === 'string' && typeof d.savedAt === 'string' ? (d as Draft) : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string, draft: Draft): void {
  try { localStorage.setItem(key, JSON.stringify(draft)); } catch { /* storage full or blocked */ }
}

function clearDraft(key: string): void {
  try { localStorage.removeItem(key); } catch { /* blocked */ }
}

export function EditorPage() {
  const location = useLocation();
  const { urlPrefix, id: scopeId } = useScope();
  const file = decodeURIComponent(location.pathname.replace(`${urlPrefix}/edit/`, ''));
  // A fresh editor per document: no state (text, hash, draft) can carry over from another one.
  return <Editor key={`${scopeId}:${file}`} file={file} />;
}

function Editor({ file }: { file: string }) {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  const draftKey = `draft:${scopeId}:${file}`;
  const docUrl = `${urlPrefix}/doc/${file}`;

  const openTab = useNavStore((s) => s.openTab);
  useEffect(() => { openTab(file); }, [file, openTab]);

  const { data, isLoading, error } = useQuery({
    queryKey: ['doc-raw', scopeId, file],
    queryFn: () => scopedFetch<PullResponse>(`/pull?file=${encodeURIComponent(file)}`),
    // Always the server copy as of opening the editor: its hash is what Guardar checks against.
    gcTime: 0,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  // `content` is null until initialized; it never follows later refetches.
  const [content, setContent] = useState<string | null>(null);
  const [savedContent, setSavedContent] = useState('');
  const [baseHash, setBaseHash] = useState('');
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const initialized = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!data || initialized.current) return;
    initialized.current = true;
    setContent(data.content);
    setSavedContent(data.content);
    setBaseHash(data.hash);
    const draft = readDraft(draftKey);
    if (draft && draft.content !== data.content) setPendingDraft(draft);
    else if (draft) clearDraft(draftKey);
  }, [data, draftKey]);

  const dirty = content !== null && content !== savedContent;

  // Every change goes to the local draft right away, so leaving the editor at any moment loses nothing.
  // Never touched while a recovery offer is open.
  useEffect(() => {
    if (content === null || pendingDraft) return;
    if (dirty) writeDraft(draftKey, { content, baseHash, savedAt: new Date().toISOString() });
    else clearDraft(draftKey);
  }, [content, dirty, baseHash, draftKey, pendingDraft]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = useCallback(async (force = false) => {
    if (content === null || saving || (!dirty && !force)) return;
    const sent = content;
    setSaving(true);
    try {
      const res = await scopedFetch<{ ok: boolean; hash: string }>('/save', {
        method: 'POST',
        body: JSON.stringify({ file, content: sent, baseHash, force }),
      });
      setBaseHash(res.hash);
      setSavedContent(sent);
      setConflict(null);
      setJustSaved(true);
      clearDraft(draftKey);
      queryClient.setQueryData<PullResponse>(['doc-raw', scopeId, file], { file, content: sent, hash: res.hash });
      queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
      queryClient.invalidateQueries({ queryKey: ['versions', scopeId, file] });
      queryClient.invalidateQueries({ queryKey: ['search-index', scopeId] });
      toast('Documento guardado', 'success');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setConflict(err.body?.['deleted'] ? 'deleted' : 'changed');
      else if (err instanceof ApiError && err.body?.['script']) toast(String(err.body['error']), 'error');
      else toast('Error al guardar. Tus cambios siguen en el editor.', 'error');
    }
    setSaving(false);
  }, [content, saving, dirty, scopedFetch, file, baseHash, draftKey, queryClient, scopeId, toast]);

  async function loadLatest() {
    try {
      const latest = await scopedFetch<PullResponse>(`/pull?file=${encodeURIComponent(file)}`);
      queryClient.setQueryData(['doc-raw', scopeId, file], latest);
      setContent(latest.content);
      setSavedContent(latest.content);
      setBaseHash(latest.hash);
      setConflict(null);
      clearDraft(draftKey);
    } catch {
      toast('No se pudo cargar la ultima version', 'error');
    }
  }

  function recoverDraft() {
    if (!pendingDraft) return;
    setContent(pendingDraft.content);
    // Saving checks against what the draft was based on, so a newer server copy is a conflict.
    setBaseHash(pendingDraft.baseHash);
    setPendingDraft(null);
  }

  function discardDraft() {
    clearDraft(draftKey);
    setPendingDraft(null);
  }

  function leave() {
    if (dirty && !confirm('Tenes cambios sin guardar. Quedan como borrador en este navegador. Salir igual?')) return;
    navigate(docUrl);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const ta = textareaRef.current!;
      const start = ta.selectionStart;
      setContent((c) => (c ?? '').substring(0, start) + '  ' + (c ?? '').substring(ta.selectionEnd));
      requestAnimationFrame(() => { ta.selectionStart = ta.selectionEnd = start + 2; });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty) void save();
    }
  }

  if (isLoading) return <div className="container"><p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;
  if (error) return <div className="container"><p style={{ color: 'var(--danger)' }}>No se pudo abrir el documento.</p></div>;

  const status = saving ? 'Guardando...' : dirty ? 'Cambios sin guardar' : justSaved ? 'Guardado' : '';
  const statusColor = dirty ? 'var(--accent)' : justSaved ? 'var(--success)' : 'var(--text-muted)';

  return (
    <div className="container">
      <Toolbar
        actions={[
          { label: 'Volver al documento', onClick: leave, icon: <ArrowLeftIcon /> },
          { label: saving ? 'Guardando...' : 'Guardar', onClick: () => void save(), primary: true, icon: <SaveIcon size={16} /> },
        ]}
      >
        <span role="status" className="mono-label" style={{ color: statusColor, alignSelf: 'center', padding: '0 14px' }}>{status}</span>
      </Toolbar>

      {pendingDraft && (
        <div className="editor-banner" role="alert">
          <span>Tenes un borrador sin guardar del {new Date(pendingDraft.savedAt).toLocaleString('es-AR')}.</span>
          <button className="primary" onClick={recoverDraft}>Recuperar borrador</button>
          <button onClick={discardDraft}>Descartar</button>
        </div>
      )}

      {conflict === 'changed' && (
        <div className="editor-banner warn" role="alert">
          <span>Alguien guardo otra version mientras editabas. Tus cambios siguen aca.</span>
          <button className="primary" onClick={() => void save(true)}>Guardar igual (la otra queda en el historial)</button>
          <button onClick={() => { if (confirm('Se pierden tus cambios. Continuar?')) void loadLatest(); }}>Descartar lo mio y cargar la ultima</button>
        </div>
      )}
      {conflict === 'deleted' && (
        <div className="editor-banner warn" role="alert">
          <span>El documento fue eliminado mientras editabas. Tus cambios siguen aca.</span>
          <button className="primary" onClick={() => void save(true)}>Volver a crearlo con lo mio</button>
        </div>
      )}

      <div className="editor-wrap">
        <textarea
          ref={textareaRef}
          id="editor"
          aria-label="Contenido del documento"
          value={content ?? ''}
          onChange={(e) => { setContent(e.target.value); setJustSaved(false); }}
          onKeyDown={handleKeyDown}
          disabled={content === null}
          // Typing before choosing would be lost: the draft is not written while the offer is open.
          readOnly={pendingDraft !== null}
        />
      </div>
    </div>
  );
}
