import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { authQueryOptions, useAuth } from '../hooks/useAuth';
import { Wordmark } from '../components/Sidebar';

const GOOGLE_ERRORS: Record<string, string> = {
  google: 'No se pudo completar el ingreso con Google. Proba de nuevo.',
  google_off: 'El ingreso con Google no esta configurado.',
  google_rate: 'Demasiados ingresos seguidos. Espera unos minutos y proba de nuevo.',
};

export function LoginPage() {
  const [params] = useSearchParams();
  const { googleEnabled } = useAuth();
  const [error, setError] = useState(GOOGLE_ERRORS[params.get('error') ?? ''] ?? '');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const form = e.target as HTMLFormElement;
    const user = (form.elements.namedItem('user') as HTMLInputElement).value;
    const pass = (form.elements.namedItem('pass') as HTMLInputElement).value;

    try {
      const data = await apiFetch<{ ok?: boolean; error?: string }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ user, pass }),
      });
      if (data.ok) {
        // No alcanza con invalidateQueries: si llegamos a /login por el rebote
        // de un guard, la query ['auth'] ya no tiene observers activos, asi que
        // invalidate la marca stale pero NO refetchea. Navegariamos a /me con
        // el `{ authenticated: false }` viejo todavia en cache y el guard nos
        // rebotaria de vuelta a /login (de ahi el "hay que loguearse 2 veces").
        // fetchQuery con staleTime 0 fuerza el request y deja el cache poblado
        // con la sesion nueva antes de navegar.
        await queryClient.fetchQuery({ ...authQueryOptions, staleTime: 0 });
        navigate('/me', { replace: true });
      } else {
        setError(data.error || 'Usuario o contrasena incorrectos');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error de conexion';
      setError(msg.includes('401') ? 'Usuario o contrasena incorrectos' : 'Error de conexion');
    }
    setLoading(false);
  }

  return (
    <div className="login">
      <section className="login-cover" aria-label="md-reader">
        <span className="mono-label login-cover-meta">Documentos de catedra · Markdown · MDX · HTML</span>
        <h1 className="login-cover-title"><Wordmark /></h1>
        <p className="login-cover-text">Programas, apuntes y simuladores de cada equipo, con el diseno de su facultad.</p>
        <span className="mono-label login-cover-meta">N.º 01 — Ingreso</span>
      </section>

      <section className="login-form-side">
        <div className="login-form-wrap">
          <h2 className="login-form-title">Inicia sesion</h2>
          <p className="login-form-sub">para acceder a tus documentos</p>
          {error && <div className="login-error" role="alert">{error}</div>}
          {googleEnabled && (
            <>
              <a href="/api/auth/google" className="login-google">Continuar con Google <span aria-hidden="true">→</span></a>
              <p className="mono-label login-or">o con usuario y contrasena</p>
            </>
          )}
          <form onSubmit={handleSubmit} className="login-fields">
            <label htmlFor="login-user" className="mono-label">Usuario</label>
            <input id="login-user" type="text" name="user" autoComplete="username" required />
            <label htmlFor="login-pass" className="mono-label">Contrasena</label>
            <input id="login-pass" type="password" name="pass" autoComplete="current-password" required />
            <button type="submit" disabled={loading} className="login-submit">
              {loading ? 'Entrando...' : 'Entrar'} <span aria-hidden="true">→</span>
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
