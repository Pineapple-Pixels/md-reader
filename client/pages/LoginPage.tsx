import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';

export function LoginPage() {
  const [error, setError] = useState('');
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
        // Invalida el cache de auth para forzar un refetch con los teams
        // hidratados desde la DB. Despues navegamos a /me.
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        navigate('/me', { replace: true });
      } else {
        setError(data.error || 'Usuario o contrasena incorrectos');
      }
    } catch (err) {
      // apiFetch tira en 401 (credenciales invalidas) y en 5xx (servidor caido)
      const msg = err instanceof Error ? err.message : 'Error de conexion';
      setError(msg.includes('401') ? 'Usuario o contrasena incorrectos' : 'Error de conexion');
    }
    setLoading(false);
  }

  return (
    <div className="container">
      <div style={{ maxWidth: 360, margin: '80px auto' }}>
        <h1 style={{ marginBottom: 24, fontSize: '1.5em' }}>Iniciar sesion</h1>
        {error && (
          <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 6, marginBottom: 16, fontSize: 14 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label htmlFor="login-user" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Usuario</label>
          <input id="login-user" type="text" name="user" autoComplete="username" required style={{ width: '100%', padding: 10, border: '1px solid var(--border-input)', borderRadius: 6, fontSize: 14, marginBottom: 14, background: 'var(--bg-input)', color: 'var(--text)' }} />
          <label htmlFor="login-pass" style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Contrasena</label>
          <input id="login-pass" type="password" name="pass" autoComplete="current-password" required style={{ width: '100%', padding: 10, border: '1px solid var(--border-input)', borderRadius: 6, fontSize: 14, marginBottom: 20, background: 'var(--bg-input)', color: 'var(--text)' }} />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 10, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
