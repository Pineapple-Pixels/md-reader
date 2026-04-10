import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { apiFetch } from '@shared/api';
import { FileList } from '../components/FileList';

export function PublicIndexPage() {
  const { data: files = [], isLoading } = useQuery({
    queryKey: ['public-docs'],
    queryFn: () => apiFetch<Array<{ name: string; modified: string }>>('/public/docs'),
  });

  return (
    <div className="container">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h1 style={{ fontSize: '1.5em' }}>Documentos publicos</h1>
        <Link to="/login" style={{ fontSize: 13, color: 'var(--text-muted)', textDecoration: 'none' }}>Admin</Link>
      </div>
      {isLoading ? (
        <p style={{ color: 'var(--text-muted)', padding: '16px 0' }}>Cargando...</p>
      ) : files.length > 0 ? (
        <FileList files={files} urlPrefix="/pub/" projectPrefix="/pub/project/" />
      ) : (
        <p className="empty-msg">No hay documentos publicos disponibles.</p>
      )}
    </div>
  );
}
