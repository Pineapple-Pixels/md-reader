import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { useToast } from '../hooks/useToast';
import { Toolbar } from '../components/Toolbar';

export function EditorPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { toast } = useToast();

  const file = location.pathname.replace(/^\/edit\//, '');

  const { data, isLoading } = useQuery({
    queryKey: ['doc-raw', file],
    queryFn: () => apiFetch<{ file: string; content: string }>(`/pull?file=${encodeURIComponent(file)}`),
  });

  const [content, setContent] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [statusColor, setStatusColor] = useState('var(--text-muted)');
  const [saving, setSaving] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Initialize content when data loads
  useEffect(() => {
    if (data?.content !== undefined) setContent(data.content);
  }, [data?.content]);

  const doSave = useCallback(async (redirect: boolean) => {
    if (saving) return;
    setSaving(true);
    setSaveStatus('Guardando...');
    setStatusColor('var(--text-muted)');
    try {
      const res = await apiFetch<{ ok: boolean }>('/save', {
        method: 'POST',
        body: JSON.stringify({ file, content }),
      });
      if (res.ok) {
        if (redirect) {
          toast('Documento guardado', 'success');
          navigate(`/doc/${file}`);
        } else {
          setSaveStatus('Guardado');
          setStatusColor('#16a34a');
          toast('Guardado automatico', 'success');
        }
      }
    } catch {
      setSaveStatus('Error al guardar');
      setStatusColor('var(--danger)');
      toast('Error al guardar', 'error');
    }
    setSaving(false);
  }, [saving, file, content, navigate, toast]);

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
          { label: 'Volver', href: '/' },
          { label: 'Ver renderizado', href: `/doc/${file}` },
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
