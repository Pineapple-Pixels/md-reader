import { ApiError, scopeToQueryParam } from '@shared/api';
import { useState, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useToast } from '../hooks/useToast';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { useNavStore } from '../hooks/useNavStore';
import { ArchiveIcon, DownloadIcon, TrashIcon } from '../components/Icons';
import type { FileEntry } from '@shared/types';
import { docKind, isDocFile, kindSummary, stripDocExt } from '@shared/doc-types';
import s from './IndexPage.module.css';

export const pad = (n: number) => String(n).padStart(2, '0');

export function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-AR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

// Index unificado para cualquier scope. La diferencia entre me/team/public es
// solo si se muestran controles de escritura — eso lo decidimos localmente
// con scope.kind, y el backend valida igual por las dudas.

export function IndexPage() {
  const { scope, urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const forget = useNavStore((s) => s.forget);
  const [newFile, setNewFile] = useState('');
  const [uploadProgress, setUploadProgress] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  // En scope public solo escribe el admin; en me/team, cualquiera logueado.
  // El backend hace la validacion real; esto es UX para esconder controles.
  const canWrite = scope.kind !== 'public';

  const { data: files = [] } = useQuery({
    queryKey: ['docs', scopeId],
    queryFn: () => scopedFetch<FileEntry[]>('/docs'),
  });

  const { data: archived = [] } = useQuery({
    queryKey: ['archived', scopeId],
    queryFn: () => scopedFetch<FileEntry[]>('/archived'),
    enabled: canWrite,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['docs', scopeId] });
    queryClient.invalidateQueries({ queryKey: ['search-index', scopeId] });
    queryClient.invalidateQueries({ queryKey: ['archived', scopeId] });
  };

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    let file = newFile.trim();
    if (!file) return;
    if (!isDocFile(file)) file += '.md';
    const name = stripDocExt(file).split('/').pop() ?? file;
    const content = docKind(file) === 'html'
      ? `<!doctype html>\n<html lang="es">\n<head>\n  <meta charset="utf-8">\n  <title>${name}</title>\n</head>\n<body>\n  <h1>${name}</h1>\n</body>\n</html>\n`
      : `# ${name}\n\n`;
    try {
      await scopedFetch('/push', {
        method: 'POST',
        body: JSON.stringify({ file, content, createOnly: true }),
      });
      setNewFile('');
      refresh();
      toast('Documento creado', 'success');
    } catch (err) {
      toast(err instanceof ApiError && err.status === 409 ? `Ya existe ${file}` : 'Error al crear documento', 'error');
    }
  }

  async function uploadFiles(mdFiles: { file: File; path: string }[]) {
    if (mdFiles.length === 0) { toast('No se encontraron archivos .md, .mdx o .html', 'error'); return; }
    setUploadProgress(`Leyendo ${mdFiles.length} archivos...`);
    const readFiles = await Promise.all(
      mdFiles.map(async ({ file, path }) => ({ path, content: await file.text() }))
    );
    let done = 0;
    const rejected: string[] = [];
    for (const { path, content } of readFiles) {
      done++;
      setUploadProgress(`Subiendo ${done}/${readFiles.length}: ${path}`);
      try {
        await scopedFetch('/push', {
          method: 'POST',
          body: JSON.stringify({ file: path, content }),
        });
      } catch {
        rejected.push(`${path} (error)`);
      }
    }
    const uploaded = readFiles.length - rejected.length;
    setUploadProgress(`Listo! ${uploaded} archivos subidos.`);
    if (rejected.length === 0) toast(`${uploaded} archivos subidos`, 'success');
    else toast(`${uploaded} subidos. No se subieron: ${rejected.join(', ')}`, 'error');
    refresh();
    setTimeout(() => setUploadProgress(''), 2000);
  }

  function handleFileSelect(fileList: FileList | null) {
    if (!fileList) return;
    const mdFiles: { file: File; path: string }[] = [];
    for (const file of Array.from(fileList)) {
      if (isDocFile(file.name)) mdFiles.push({ file, path: file.name });
    }
    uploadFiles(mdFiles);
  }

  function handleFolderSelect(fileList: FileList | null) {
    if (!fileList) return;
    const mdFiles: { file: File; path: string }[] = [];
    for (const file of Array.from(fileList)) {
      if (!isDocFile(file.name)) continue;
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
            if (isDocFile(file.name)) result.push({ file, path });
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
    const scopeParam = scopeToQueryParam(scope);
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

  async function archiveEntry(name: string) {
    try {
      await scopedFetch('/archive', { method: 'POST', body: JSON.stringify({ file: name }) });
      forget(name);
      toast(`"${name}" archivado. Lo podes restaurar desde Archivados`, 'success');
      refresh();
    } catch (err) {
      toast(err instanceof ApiError && err.status === 409 ? `Ya hay un archivado llamado "${name}"` : 'Error al archivar', 'error');
    }
  }

  const rootFiles = files.filter((f) => !f.name.includes('/'));
  const folders: Record<string, FileEntry[]> = {};
  for (const f of files) {
    if (!f.name.includes('/')) continue;
    const topFolder = f.name.split('/')[0];
    if (!folders[topFolder]) folders[topFolder] = [];
    folders[topFolder].push(f);
  }

  const folderEntries = Object.entries(folders);
  const hasContent = files.length > 0;

  const title =
    scope.kind === 'me' ? 'Mis documentos' :
    scope.kind === 'team' ? `Documentos del team` :
    'Documentos publicos';

  function renderActions(name: string) {
    if (!canWrite) return null;
    return (
      <span className={s.indexFileActions}>
        <button className="icon-btn" aria-label="Descargar" data-tip="Descargar" onClick={(e) => { e.preventDefault(); downloadDoc(name); }}>
          <DownloadIcon size={17} />
        </button>
        <button className="icon-btn" aria-label="Archivar" data-tip="Archivar" onClick={(e) => { e.preventDefault(); archiveEntry(name); }}>
          <ArchiveIcon size={17} />
        </button>
        <button className="icon-btn danger" aria-label="Eliminar" data-tip="Eliminar" onClick={(e) => { e.preventDefault(); deleteDoc(name); }}>
          <TrashIcon size={17} />
        </button>
      </span>
    );
  }

  return (
    <div className="container">
      <div className={s.indexHead}>
        <h1 className={s.indexTitle}>{title}</h1>
        <span className="mono-label">{pad(files.length)} docs</span>
      </div>

      {canWrite && (
        <>
          <div className="new-doc-form">
            <form onSubmit={handleCreate}>
              <input type="text" value={newFile} onChange={(e) => setNewFile(e.target.value)} placeholder="nombre.md, nombre.mdx o carpeta/nombre.html" required />
              <button type="submit">Crear documento</button>
            </form>
          </div>

          <div className="upload-actions">
            <label className="upload-btn file-btn">
              <input type="file" accept=".md,.mdx,.html" multiple style={{ display: 'none' }} onChange={(e) => handleFileSelect(e.target.files)} />
              <span className="upload-icon" aria-hidden="true">↑</span> Subir archivos
            </label>
            <label className="upload-btn folder-btn">
              <input type="file" {...({ webkitdirectory: '' } as unknown as Record<string, string>)} style={{ display: 'none' }} onChange={(e) => handleFolderSelect(e.target.files)} />
              <span className="upload-icon" aria-hidden="true">↑</span> Subir proyecto
            </label>
          </div>

          <div
            ref={dropRef}
            className={`drop-zone${dragOver ? ' drag-over' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <p>O arrastra archivos .md, .mdx, .html o carpetas aca</p>
          </div>

          {uploadProgress && (
            <div style={{ padding: '8px 0', fontSize: 13, color: 'var(--text-secondary)' }}>{uploadProgress}</div>
          )}
        </>
      )}

      {hasContent ? (
        <>
          {folderEntries.length > 0 && (
            <>
              <h2 className={s.indexSectionLabel}><span>Carpetas</span><span>{pad(folderEntries.length)}</span></h2>
              <ul className={s.indexList}>
                {folderEntries.map(([folder, docs], i) => {
                  const latestDate = formatDate(
                    new Date(Math.max(...docs.map((d) => new Date(d.modified).getTime()))).toISOString()
                  );
                  return (
                    <li key={folder} className={s.indexRow}>
                      <span className={s.indexNum}>{pad(i + 1)}</span>
                      <Link to={`${urlPrefix}/project/${folder}`} className={s.indexName}>{folder}/</Link>
                      <span className={s.indexMeta}>{kindSummary(docs.map((d) => d.name))} · {latestDate}</span>
                      {canWrite ? (
                        <span className={s.indexFileActions}>
                          <button className="icon-btn" aria-label="Archivar" data-tip="Archivar" onClick={() => archiveEntry(folder)}><ArchiveIcon size={17} /></button>
                        </span>
                      ) : <span />}
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {rootFiles.length > 0 && (
            <>
              <h2 className={s.indexSectionLabel}><span>Documentos</span><span>{pad(rootFiles.length)}</span></h2>
              <ul className={s.indexList}>
                {rootFiles.map((doc, i) => {
                  const kind = docKind(doc.name);
                  return (
                    <li key={doc.name} className={s.indexRow}>
                      <span className={s.indexNum}>{pad(i + 1)}</span>
                      <span className={s.indexName}>
                        <Link to={`${urlPrefix}/doc/${doc.name}`} className={s.indexName}>{stripDocExt(doc.name)}</Link>
                        {kind && <span className={s.indexKind}>{kind.toUpperCase()}</span>}
                      </span>
                      <span className={s.indexMeta}>{formatDate(doc.modified)}</span>
                      {renderActions(doc.name) ?? <span />}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      ) : (
        <p className="empty-msg">No hay documentos en este scope.</p>
      )}

      {canWrite && archived.length > 0 && (
        <Link to={`${urlPrefix}/archived`} className={s.indexArchivedLink}>
          Archivados ({archived.length}) <span aria-hidden="true">→</span>
        </Link>
      )}
    </div>
  );
}
