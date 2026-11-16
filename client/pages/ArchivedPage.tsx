import { ApiError } from '@shared/api';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { FileEntry } from '@shared/types';
import { docKind, kindSummary, stripDocExt } from '@shared/doc-types';
import { useToast } from '../hooks/useToast';
import { RestoreIcon } from '../components/Icons';
import { useScope, useScopedFetch } from '../hooks/useScope';
import { formatDate, pad } from './IndexPage';
import s from './IndexPage.module.css';

/** Archived docs and folders of the scope, each with a way back. */
export function ArchivedPage() {
  const { urlPrefix, id: scopeId } = useScope();
  const scopedFetch = useScopedFetch();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: files = [], isLoading } = useQuery({
    queryKey: ['archived', scopeId],
    queryFn: () => scopedFetch<FileEntry[]>('/archived'),
  });

  // File by file, so an archived doc goes back into its folder even when that folder still has live docs.
  async function restore(label: string, names: string[]) {
    const taken: string[] = [];
    let failed = false;
    for (const name of names) {
      try {
        await scopedFetch('/unarchive', { method: 'POST', body: JSON.stringify({ file: name }) });
      } catch (err) {
        if (err instanceof ApiError && err.status === 409) taken.push(name);
        else failed = true;
      }
    }
    queryClient.invalidateQueries({ queryKey: ['archived', scopeId] });
    queryClient.invalidateQueries({ queryKey: ['docs', scopeId] });
    queryClient.invalidateQueries({ queryKey: ['search-index', scopeId] });
    if (failed) toast('Error al restaurar', 'error');
    else if (taken.length > 0) toast(`Ya existe ${taken.join(', ')}. Renombra o archiva ese primero`, 'error');
    else toast(`"${label}" restaurado`, 'success');
  }

  const rootFiles = files.filter((f) => !f.name.includes('/'));
  const folders = new Map<string, FileEntry[]>();
  for (const f of files) {
    if (!f.name.includes('/')) continue;
    const top = f.name.split('/')[0]!;
    folders.set(top, [...(folders.get(top) ?? []), f]);
  }

  return (
    <div className="container">
      <div className={s.indexHead}>
        <h1 className={s.indexTitle}>Archivados</h1>
        <Link to={urlPrefix} className="mono-label">← Documentos</Link>
      </div>

      {isLoading ? (
        <p className="empty-msg">Cargando...</p>
      ) : files.length === 0 ? (
        <p className="empty-msg">No hay nada archivado.</p>
      ) : (
        <>
          {folders.size > 0 && (
            <>
              <h2 className={s.indexSectionLabel}><span>Carpetas</span><span>{pad(folders.size)}</span></h2>
              <ul className={s.indexList}>
                {[...folders].map(([folder, docs], i) => (
                  <li key={folder} className={s.indexRow}>
                    <span className={s.indexNum}>{pad(i + 1)}</span>
                    <span className={s.indexName}>{folder}/</span>
                    <span className={s.indexMeta}>{kindSummary(docs.map((d) => d.name))}</span>
                    <span className={s.indexFileActions}>
                      <button className="icon-btn" aria-label="Restaurar carpeta" data-tip="Restaurar carpeta" onClick={() => restore(folder, docs.map((d) => d.name))}><RestoreIcon size={17} /></button>
                    </span>
                  </li>
                ))}
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
                        {stripDocExt(doc.name)}
                        {kind && <span className={s.indexKind}>{kind.toUpperCase()}</span>}
                      </span>
                      <span className={s.indexMeta}>{formatDate(doc.modified)}</span>
                      <span className={s.indexFileActions}>
                        <button className="icon-btn" aria-label="Restaurar" data-tip="Restaurar" onClick={() => restore(doc.name, [doc.name])}><RestoreIcon size={17} /></button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </div>
  );
}
