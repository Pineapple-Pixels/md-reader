import { Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './hooks/useTheme';
import { ToastProvider } from './hooks/useToast';
import { ScopeLayout } from './components/Layout';
import { LoginPage } from './pages/LoginPage';
import { IndexPage } from './pages/IndexPage';
import { DocPage } from './pages/DocPage';
import { EditorPage } from './pages/EditorPage';
import { SourcePage } from './pages/SourcePage';
import { ProjectPage } from './pages/ProjectPage';

// Rutas del cliente. Los scopes son los tres prefijos estables:
//   /me/*      → docs privados del user (requiere auth)
//   /t/:slug/* → docs del team (requiere auth + membership)
//   /pub/*     → docs publicos (lectura anonima, comentar requiere login)
//
// Dentro de cada scope las sub-rutas son identicas. ScopeLayout inyecta el
// ScopeContext asi las paginas hijas no necesitan conocer el prefijo.

export function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route path="/me" element={<ScopeLayout kind="me" />}>
            <Route index element={<IndexPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="edit/*" element={<EditorPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          <Route path="/t/:slug" element={<ScopeLayout kind="team" />}>
            <Route index element={<IndexPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="edit/*" element={<EditorPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          <Route path="/pub" element={<ScopeLayout kind="public" />}>
            <Route index element={<IndexPage />} />
            <Route path="doc/*" element={<DocPage />} />
            <Route path="source/*" element={<SourcePage />} />
            <Route path="project/:folder" element={<ProjectPage />} />
          </Route>

          {/* Raiz: si hay sesion el scope layout de /me hara el rebote a /login. */}
          <Route path="/" element={<Navigate to="/me" replace />} />
          <Route path="*" element={<Navigate to="/me" replace />} />
        </Routes>
      </ToastProvider>
    </ThemeProvider>
  );
}
