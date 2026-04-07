import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';

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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ user, pass }),
      });
      const data = await res.json();
      if (data.ok) {
        queryClient.invalidateQueries({ queryKey: ['auth'] });
        navigate('/', { replace: true });
      } else {
        setError(data.error || 'Usuario o contrasena incorrectos');
      }
    } catch {
      setError('Error de conexion');
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
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Usuario</label>
          <input type="text" name="user" required style={{ width: '100%', padding: 10, border: '1px solid var(--border-input)', borderRadius: 6, fontSize: 14, marginBottom: 14, background: 'var(--bg-input)', color: 'var(--text)' }} />
          <label style={{ display: 'block', fontSize: 14, fontWeight: 500, marginBottom: 4 }}>Contrasena</label>
          <input type="password" name="pass" required style={{ width: '100%', padding: 10, border: '1px solid var(--border-input)', borderRadius: 6, fontSize: 14, marginBottom: 20, background: 'var(--bg-input)', color: 'var(--text)' }} />
          <button type="submit" disabled={loading} style={{ width: '100%', padding: 10, background: 'var(--accent)', color: 'white', border: 'none', borderRadius: 6, fontSize: 14, cursor: 'pointer', fontWeight: 500 }}>
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
}
