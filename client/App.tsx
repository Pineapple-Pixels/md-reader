import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { Layout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { PrivateIndexPage } from './pages/PrivateIndexPage';
import { PublicIndexPage } from './pages/PublicIndexPage';
import { DocPage } from './pages/DocPage';
import { EditorPage } from './pages/EditorPage';
import { SourcePage } from './pages/SourcePage';
import { ProjectPage } from './pages/ProjectPage';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuth();
  if (isLoading) return <div className="container"><p style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Cargando...</p></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          {/* Public routes */}
          <Route path="/pub" element={<Layout />}>
            <Route index element={<PublicIndexPage />} />
            <Route path="project/:folder" element={<ProjectPage isPublic />} />
            <Route path="source/*" element={<SourcePage isPublic />} />
            <Route path="*" element={<DocPage isPublic />} />
          </Route>

          {/* Private routes */}
          <Route path="/" element={<PrivateRoute><Layout isPrivate /></PrivateRoute>}>
            <Route index element={<PrivateIndexPage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="edit/*" element={<EditorPage />} />
            <Route path="source/*" element={<SourcePage />} />
          </Route>
        </Routes>
      </ToastProvider>
    </ThemeProvider>
  );
}
