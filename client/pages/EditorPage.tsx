import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { Toolbar } from '../components/Toolbar';

export function EditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();

  const editPrefix = `${urlPrefix}/edit/`;
  const file = decodeURIComponent(location.pathname.replace(editPrefix, ''));

  const { data, isLoading } = useQuery({
    queryKey: ['doc-raw', scopeId, file],
    queryFn: () => scopedFetch<{ file: string; content: string }>(`/pull?file=${encodeURIComponent(file)}`),
  });

  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [statusColor, setStatusColor] = useState('var(--text-muted)');
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Live refs so doSave doesn't go stale between renders. Using state here caused
  // manual Ctrl+S to be dropped while an auto-save was in flight.
  const savingRef = useRef(false);
  const pendingSaveRef = useRef<{ redirect: boolean } | null>(null);
  const contentRef = useRef('');

  useEffect(() => {
    if (data?.content !== undefined) setContent(data.content);
  }, [data?.content]);

  useEffect(() => { contentRef.current = content; }, [content]);

  // Reset auto-save state cuando cambia el archivo — evita que un timer pendiente
  // sobreescriba el nuevo archivo con el contenido del anterior.
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = null;
    pendingSaveRef.current = null;
    savingRef.current = false;
    contentRef.current = '';
    setContent('');
    setSaveStatus('');
  }, [file]);

  const doSave = useCallback(async (redirect: boolean): Promise<void> => {
    if (savingRef.current) {
      pendingSaveRef.current = { redirect: pendingSaveRef.current?.redirect || redirect };
      return;
    }
    savingRef.current = true;
    setSaveStatus('Guardando...');
    setStatusColor('var(--text-muted)');
    try {
      const res = await scopedFetch<{ ok: boolean }>('/save', {
        method: 'POST',
        body: JSON.stringify({ file, content: contentRef.current }),
      });
      if (res.ok) {
        queryClient.invalidateQueries({ queryKey: ['doc', scopeId, file] });
        queryClient.invalidateQueries({ queryKey: ['search-index', scopeId] });
        if (redirect) {
          toast('Documento guardado', 'success');
          navigate(`${urlPrefix}/doc/${file}`);
          savingRef.current = false;
          return;
        }
        setSaveStatus('Guardado');
        setStatusColor('#16a34a');
        toast('Guardado automatico', 'success');
      }
    } catch {
      setSaveStatus('Error al guardar');
      setStatusColor('var(--danger)');
      toast('Error al guardar', 'error');
    }
    savingRef.current = false;
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) doSave(pending.redirect);
  }, [file, navigate, toast, scopedFetch, queryClient, scopeId, urlPrefix]);

  function handleChange(value: string) {
    setContent(value);
    setSaveStatus('Sin guardar...');
    setStatusColor('#d97706');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSave(false), 2000);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = textareaRef.current!;
      const start = textarea.selectionStart;
      const newValue = content.substring(0, start) + '  ' + content.substring(textarea.selectionEnd);
      setContent(newValue);
      requestAnimationFrame(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      });
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
      doSave(true);
    }
  }

  if (isLoading) return <div className="container"><p style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;

  return (
    <div className="container">
      <Toolbar
        actions={[
          { label: 'Volver', href: urlPrefix },
          { label: 'Ver renderizado', href: `${urlPrefix}/doc/${file}` },
          { label: 'Guardar', onClick: () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); doSave(true); }, primary: true },
        ]}
      >
        <span style={{ fontSize: 13, color: statusColor, alignSelf: 'center', marginLeft: 4 }}>{saveStatus}</span>
      </Toolbar>
      <div className="editor-wrap">
        <textarea
          ref={textareaRef}
          id="editor"
          value={content}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
    </div>
  );
}
