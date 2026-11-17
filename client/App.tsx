import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { AccountLayout, ScopeLayout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { IndexPage } from './pages/IndexPage';
import { DocPage } from './pages/DocPage';
import { SourcePage } from './pages/SourcePage';
import { ProjectPage } from './pages/ProjectPage';

// Reading routes stay in the main bundle; writing and settings load on first visit.
const EditorPage = lazy(() => import('./pages/EditorPage').then((m) => ({ default: m.EditorPage })));
const HistoryPage = lazy(() => import('./pages/HistoryPage').then((m) => ({ default: m.HistoryPage })));
const ArchivedPage = lazy(() => import('./pages/ArchivedPage').then((m) => ({ default: m.ArchivedPage })));
const AdminPage = lazy(() => import('./pages/AdminPage').then((m) => ({ default: m.AdminPage })));
const ProfilePage = lazy(() => import('./pages/ProfilePage').then((m) => ({ default: m.ProfilePage })));

// Rutas del cliente. Los scopes son los tres prefijos estables:
//   /me/*      → docs privados del user (requiere auth)
//   /t/:slug/* → docs del team (requiere auth + membership)
//   /pub/:org/* → docs publicos de una org (lectura anonima, comentar requiere login en esa org)
//
// Dentro de cada scope las sub-rutas son identicas. ScopeLayout inyecta el
// ScopeContext asi las paginas hijas no necesitan conocer el prefijo.

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Suspense fallback={<div className="container"><p className="loading-msg">Cargando...</p></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<AccountLayout />}>
            <Route path="/admin" element={<AdminPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Route>

          <Route path="/me" element={<ScopeLayout kind="me" />}>
            <Route index element={<IndexPage />} />
            <Route path="archived" element={<ArchivedPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="edit/*" element={<EditorPage />} />
            <Route path="history/*" element={<HistoryPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          <Route path="/t/:slug" element={<ScopeLayout kind="team" />}>
            <Route index element={<IndexPage />} />
            <Route path="archived" element={<ArchivedPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="edit/*" element={<EditorPage />} />
            <Route path="history/*" element={<HistoryPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          <Route path="/pub/:org" element={<ScopeLayout kind="public" />}>
            <Route index element={<IndexPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          {/* Public links shared before organizations existed point at the default org. */}
          <Route path="/pub" element={<LegacyPublicRedirect />} />
          <Route path="/pub/doc/*" element={<LegacyPublicRedirect />} />
          <Route path="/pub/source/*" element={<LegacyPublicRedirect />} />
          <Route path="/pub/project/*" element={<LegacyPublicRedirect />} />

          {/* Raiz: si hay sesion el scope layout de /me hara el rebote a /login. */}
          <Route path="/" element={<Navigate to="/me" replace />} />
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
        </Suspense>
      </ToastProvider>
    </ThemeProvider>
  );
}

function LegacyPublicRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={`${pathname.replace(/^\/pub/, '/pub/default')}${search}${hash}`} replace />;
}
