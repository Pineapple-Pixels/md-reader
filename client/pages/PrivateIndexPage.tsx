import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@shared/api';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';
import { FileList } from '../components/FileList';

interface FileMeta {
  [key: string]: { public?: boolean };
}

export function PrivateIndexPage() {
  const { isDark, toggle } = useTheme();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newFile, setNewFile] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: files = [] } = useQuery({
    queryKey: ['docs'],
    queryFn: () => apiFetch<{ name: string; modified: string }[]>('/docs'),
  });

  const { data: meta = {} } = useQuery<FileMeta>({
    queryKey: ['meta'],
    queryFn: () => apiFetch('/meta'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['docs'] });
    queryClient.invalidateQueries({ queryKey: ['meta'] });
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let file = newFile.trim();
    if (!file) return;
    if (!file.endsWith('.md')) file += '.md';
    try {
      await apiFetch('/push', {
        method: 'POST',
        body: JSON.stringify({ file, content: `# ${file.replace(/\.md$/, '').split('/').pop()}\n\n` }),
      });
      setNewFile('');
      refresh();
      toast('Documento creado', 'success');
    } catch {
      toast('Error al crear documento', 'error');
    }
  }

  async function uploadFiles(mdFiles: { file: File; path: string }[]) {
    if (mdFiles.length === 0) { toast('No se encontraron archivos .md', 'error'); return; }
    // Read all file contents upfront to avoid File objects being invalidated during sequential uploads
    setUploadProgress(`Leyendo ${mdFiles.length} archivos...`);
    const readFiles = await Promise.all(
      mdFiles.map(async ({ file, path }) => ({ path, content: await file.text() }))
    );
    let done = 0;
    for (const { path, content } of readFiles) {
      done++;
      setUploadProgress(`Subiendo ${done}/${readFiles.length}: ${path}`);
      await apiFetch('/push', {
        method: 'POST',
        body: JSON.stringify({ file: path, content }),
      });
    }
    setUploadProgress(`Listo! ${mdFiles.length} archivos subidos.`);
    toast(`${mdFiles.length} archivos subidos`, 'success');
    refresh();
    setTimeout(() => setUploadProgress(''), 2000);
  }

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList) return;
    const mdFiles: { file: File; path: string }[] = [];
    for (const file of Array.from(fileList)) {
      if (file.name.endsWith('.md')) mdFiles.push({ file, path: file.name });
    }
    uploadFiles(mdFiles);
  }

  function handleFolderSelect(fileList: FileList | null) {
    if (!fileList) return;
    const mdFiles: { file: File; path: string }[] = [];
    for (const file of Array.from(fileList)) {
      if (!file.name.endsWith('.md')) continue;
      mdFiles.push({ file, path: file.webkitRelativePath || file.name });
    }
    uploadFiles(mdFiles);
  }

  const readEntriesRecursive = useCallback(async (entries: FileSystemEntry[], result: { file: File; path: string }[], basePath: string) => {
    await Promise.all(entries.map((entry) => {
      if (entry.isFile) {
        return new Promise<void>((resolve) => {
          (entry as FileSystemFileEntry).file((file) => {
            const path = basePath ? `${basePath}/${file.name}` : file.name;
            if (file.name.endsWith('.md')) result.push({ file, path });
            resolve();
          });
        });
      } else if (entry.isDirectory) {
        return new Promise<void>((resolve) => {
          const reader = (entry as FileSystemDirectoryEntry).createReader();
          reader.readEntries(async (children) => {
            const prefix = basePath ? `${basePath}/${entry.name}` : entry.name;
            await readEntriesRecursive(Array.from(children), result, prefix);
            resolve();
          });
        });
      }
      return Promise.resolve();
    }));
  }, []);

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const items = e.dataTransfer.items;
    if (items && items.length > 0) {
      const allFiles: { file: File; path: string }[] = [];
      const entries: FileSystemEntry[] = [];
      for (const item of Array.from(items)) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) entries.push(entry);
      }
      if (entries.length > 0 && entries.some((e) => e.isDirectory)) {
        await readEntriesRecursive(entries, allFiles, '');
        await uploadFiles(allFiles);
        return;
      }
    }
    handleFileSelect(e.dataTransfer.files);
  }

  async function toggleVis(name: string) {
    try {
      const data = await apiFetch<{ ok: boolean; public: boolean }>('/toggle-visibility', {
        method: 'POST',
        body: JSON.stringify({ file: name }),
      });
      if (data.ok) {
        toast(data.public ? `${name} es publico` : `${name} es privado`, 'success');
        queryClient.invalidateQueries({ queryKey: ['meta'] });
      }
    } catch {
      toast('Error al cambiar visibilidad', 'error');
    }
  }

  function downloadDoc(name: string) {
    window.location.href = `/api/download?file=${encodeURIComponent(name)}`;
  }

  async function deleteDoc(name: string) {
    if (!confirm(`Eliminar "${name}"? Se guardara una version de respaldo.`)) return;
    try {
      const data = await apiFetch<{ ok: boolean }>('/delete', {
        method: 'DELETE',
        body: JSON.stringify({ file: name }),
      });
      if (data.ok) {
        toast(`"${name}" eliminado`, 'success');
        refresh();
      }
    } catch {
      toast('Error al eliminar', 'error');
    }
  }

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    queryClient.invalidateQueries({ queryKey: ['auth'] });
    window.location.href = '/login';
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5em' }}>Mis documentos</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Link to="/pub" target="_blank" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none' }}>Ver sitio publico</Link>
          <button
            className="theme-toggle"
            onClick={toggle}
            aria-label={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
            title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
          >
            <span aria-hidden="true">{isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}</span>
          </button>
          <button onClick={handleLogout} style={{ fontSize: 13, color: 'var(--danger)', background: 'none', border: 'none', cursor: 'pointer' }}>Cerrar sesion</button>
        </div>
      </div>

      <div className="new-doc-form">
        <form onSubmit={handleCreate}>
          <input type="text" value={newFile} onChange={(e) => setNewFile(e.target.value)} placeholder="nombre.md o carpeta/nombre.md" required />
          <button type="submit">Crear documento</button>
        </form>
      </div>

      <div className="upload-actions">
        <label className="upload-btn file-btn">
          <input type="file" accept=".md" multiple style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files)} />
          <span className="upload-icon">&#128196;</span> Subir Archivos
        </label>
        <label className="upload-btn folder-btn">
          <input type="file" {...({ webkitdirectory: '' } as any)} style={{ display: 'none' }} onChange={(e) => handleFolderSelect(e.target.files)} />
          <span className="upload-icon">&#128193;</span> Subir Proyecto
        </label>
      </div>

      <div
        ref={dropRef}
        className={`drop-zone${dragOver ? ' drag-over' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <p>O arrastra archivos .md / carpetas aca</p>
      </div>

      {uploadProgress && (
        <div style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-secondary)' }}>{uploadProgress}</div>
      )}

      {files.length > 0 ? (
        <FileList
          files={files}
          urlPrefix="/doc/"
          projectPrefix="/project/"
          actions={[
            {
              label: (name) => meta[name]?.public ? 'Publico' : 'Privado',
              className: (name) => meta[name]?.public ? 'publish-btn' : '',
              onClick: toggleVis,
            },
            { label: 'Descargar', className: 'download-btn', onClick: downloadDoc },
            { label: 'Eliminar', className: 'delete-btn', onClick: deleteDoc },
          ]}
        />
      ) : (
        <p className="empty-msg">No hay documentos. Crea uno o subi archivos.</p>
      )}
    </div>
  );
}
