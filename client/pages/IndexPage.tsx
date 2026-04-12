import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../hooks/useToast';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { FileList } from '../components/FileList';

// Index unificado para cualquier scope. La diferencia entre me/team/public es
// solo si se muestran controles de escritura — eso lo decidimos localmente
// con scope.kind, y el backend valida igual por las dudas.

export function IndexPage() {
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newFile, setNewFile] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // En scope public solo escribe el admin; en me/team, cualquiera logueado.
  // El backend hace la validacion real; esto es UX para esconder controles.
  const canWrite = scope.kind !== 'public';

  const { data: files = [] } = useQuery({
    queryKey: ['docs', scopeId],
    queryFn: () => scopedFetch<{ name: string; modified: string }[]>('/docs'),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['docs', scopeId] });
    queryClient.invalidateQueries({ queryKey: ['search-index', scopeId] });
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let file = newFile.trim();
    if (!file) return;
    if (!file.endsWith('.md')) file += '.md';
    try {
      await scopedFetch('/push', {
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
    setUploadProgress(`Leyendo ${mdFiles.length} archivos...`);
    const readFiles = await Promise.all(
      mdFiles.map(async ({ file, path }) => ({ path, content: await file.text() }))
    );
    let done = 0;
    for (const { path, content } of readFiles) {
      done++;
      setUploadProgress(`Subiendo ${done}/${readFiles.length}: ${path}`);
      await scopedFetch('/push', {
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

  function downloadDoc(name: string) {
    // Incluye scope en el link de descarga para que el backend lo resuelva correcto.
    const scopeParam =
      scope.kind === 'me' ? 'me' :
      scope.kind === 'team' ? `team:${scope.slug}` :
      'public';
    window.location.href = `/api/download?scope=${encodeURIComponent(scopeParam)}&file=${encodeURIComponent(name)}`;
  }

  async function deleteDoc(name: string) {
    if (!confirm(`Eliminar "${name}"? Se guardara una version de respaldo.`)) return;
    try {
      const data = await scopedFetch<{ ok: boolean }>('/delete', {
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

  const title =
    scope.kind === 'me' ? 'Mis documentos' :
    scope.kind === 'team' ? `Documentos del team` :
    'Documentos publicos';

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5em' }}>{title}</h1>
      </div>

      {canWrite && (
        <>
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
              <input type="file" {...({ webkitdirectory: '' } as unknown as Record<string, string>)} style={{ display: 'none' }} onChange={(e) => handleFolderSelect(e.target.files)} />
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
        </>
      )}

      {files.length > 0 ? (
        <FileList
          files={files}
          urlPrefix={`${urlPrefix}/doc/`}
          projectPrefix={`${urlPrefix}/project/`}
          actions={canWrite ? [
            { label: 'Descargar', className: 'download-btn', onClick: downloadDoc },
            { label: 'Eliminar', className: 'delete-btn', onClick: deleteDoc },
          ] : []}
        />
      ) : (
        <p className="empty-msg">No hay documentos en este scope.</p>
      )}
    </div>
  );
}
