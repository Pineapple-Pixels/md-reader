import { Link } from 'react-router-dom';
import type { FileEntry } from '@shared/types';

interface FileAction {
  label: string | ((name: string) => string);
  className?: string | ((name: string) => string);
  onClick: (name: string) => void;
}

interface FileListProps {
  files: FileEntry[];
  urlPrefix?: string;
  projectPrefix?: string;
  actions?: FileAction[];
}

export function FileList({ files, urlPrefix = '/pub/', projectPrefix = '/pub/project/', actions = [] }: FileListProps) {
  const rootFiles = files.filter((f) => !f.name.includes('/'));
  const folders: Record<string, FileEntry[]> = {};

  for (const f of files) {
    if (!f.name.includes('/')) continue;
    const topFolder = f.name.split('/')[0];
    if (!folders[topFolder]) folders[topFolder] = [];
    folders[topFolder].push(f);
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('es-AR', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function renderActions(name: string) {
    return actions.map((action, i) => {
      const label = typeof action.label === 'function' ? action.label(name) : action.label;
      const cls = typeof action.className === 'function' ? action.className(name) : action.className;
      return (
        <button key={i} className={`action-btn ${cls || ''}`} onClick={() => action.onClick(name)}>
          {label}
        </button>
      );
    });
  }

  return (
    <>
      {Object.entries(folders).map(([folder, docs]) => {
        const latestDate = formatDate(
          new Date(Math.max(...docs.map((d) => new Date(d.modified).getTime()))).toISOString()
        );
        return (
          <ul key={folder} className="file-list">
            <li>
              <Link to={`${projectPrefix}${folder}`} style={{ fontWeight: 600 }}>
                <span className="tree-icon">&#128193;</span> {folder}/
              </Link>
              <span className="meta">{docs.length} docs &middot; {latestDate}</span>
              {renderActions(folder)}
            </li>
          </ul>
        );
      })}
      {rootFiles.length > 0 && (
        <ul className="file-list">
          {rootFiles.map((doc) => {
            const displayName = doc.name.split('/').pop();
            return (
              <li key={doc.name}>
                <Link to={`${urlPrefix}${doc.name}`}>{displayName}</Link>
                <span className="meta">{formatDate(doc.modified)}</span>
                {renderActions(doc.name)}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
