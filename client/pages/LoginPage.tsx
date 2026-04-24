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
        await queryClient.invalidateQueries({ queryKey: ['auth'] });
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
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--bg)' }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'var(--accent)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <span style={{ color: '#fff', fontWeight: 700, fontSize: 22, fontFamily: 'var(--font-mono)' }}>M</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', marginBottom: 4, fontFamily: 'var(--font-heading)' }}>md-reader</h1>
          <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Inicia sesion para acceder a tus documentos</p>
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 16, padding: 32, boxShadow: 'var(--shadow-card)', textAlign: 'left' }}>
          {error && (
            <div style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit}>
            <label htmlFor="login-user" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-secondary)' }}>Usuario</label>
            <input id="login-user" type="text" name="user" autoComplete="username" required style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-input)', borderRadius: 10, fontSize: 14, marginBottom: 14, background: 'var(--bg-input)', color: 'var(--text)', outline: 'none' }} />
            <label htmlFor="login-pass" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 4, color: 'var(--text-secondary)' }}>Contrasena</label>
            <input id="login-pass" type="password" name="pass" autoComplete="current-password" required style={{ width: '100%', padding: '10px 14px', border: '1px solid var(--border-input)', borderRadius: 10, fontSize: 14, marginBottom: 20, background: 'var(--bg-input)', color: 'var(--text)', outline: 'none' }} />
            <button type="submit" disabled={loading} style={{ width: '100%', padding: '10px 14px', background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontWeight: 600, transition: 'background 0.12s' }}>
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 16 }}>Markdown document server</p>
      </div>
    </div>
  );
}
