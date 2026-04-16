import { useState, useEffect, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { useAuth } from '../hooks/useAuth';
import { useToast } from '../hooks/useToast';
import { useTheme } from '../hooks/useTheme';

// Pagina de perfil self-service: cualquier user logueado puede cambiar su
// displayName y su password. El cambio de password exige la actual (defensa
// contra alguien que toma una sesion abierta).
export function ProfilePage() {
  const { isAuthenticated, user, displayName: currentDisplayName, role, isLoading } = useAuth();
  const { toast } = useToast();
  const { isDark, toggle } = useTheme();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [displayName, setDisplayName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    setDisplayName(currentDisplayName ?? '');
  }, [currentDisplayName]);

  if (isLoading) return <div className="container"><p className="loading-msg">Cargando...</p></div>;
  if (!isAuthenticated) {
    navigate('/login', { replace: true });
    return null;
  }

  async function handleProfileSave(e: FormEvent) {
    e.preventDefault();
    const trimmed = displayName.trim();
    if (trimmed === (currentDisplayName ?? '')) {
      toast('No hay cambios', 'info');
      return;
    }
    setSavingProfile(true);
    try {
      await apiFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ displayName: trimmed }),
      });
      queryClient.invalidateQueries({ queryKey: ['auth'] });
      toast('Nombre actualizado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    }
    setSavingProfile(false);
  }

  async function handlePasswordSave(e: FormEvent) {
    e.preventDefault();
    if (!currentPassword || !newPassword) {
      toast('Completa password actual y nueva', 'error');
      return;
    }
    if (newPassword.length < 4) {
      toast('La nueva password debe tener al menos 4 caracteres', 'error');
      return;
    }
    if (newPassword !== confirmPassword) {
      toast('La confirmacion no coincide', 'error');
      return;
    }
    setSavingPassword(true);
    try {
      await apiFetch('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast('Password actualizada', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Error al cambiar password';
      toast(msg.includes('401') ? 'Password actual incorrecta' : msg, 'error');
    }
    setSavingPassword(false);
  }

  return (
    <div className="container">
      <div className="admin-header">
        <h1>Mi perfil</h1>
        <div className="admin-header-actions">
          <Link to="/me" className="admin-back">Volver a docs</Link>
          <button className="theme-toggle" onClick={toggle} aria-label="Cambiar tema">
            {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
          </button>
        </div>
      </div>

      <section className="profile-section">
        <h2 className="profile-section-title">Cuenta</h2>
        <div className="profile-field-readonly">
          <div><span className="profile-label">Usuario</span><strong>{user}</strong></div>
          <div><span className="profile-label">Rol</span><span className={`role-badge ${role}`}>{role}</span></div>
        </div>
        <p className="profile-hint">Usuario y rol solo pueden cambiarse desde el panel de Admin.</p>
      </section>

      <form className="profile-section" onSubmit={handleProfileSave}>
        <h2 className="profile-section-title">Nombre visible</h2>
        <label className="profile-field">
          <span className="profile-label">Nombre</span>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            maxLength={100}
            placeholder="Como queres que te muestren"
          />
        </label>
        <div className="profile-actions">
          <button type="submit" className="admin-btn primary" disabled={savingProfile}>
            {savingProfile ? 'Guardando...' : 'Guardar nombre'}
          </button>
        </div>
      </form>

      <form className="profile-section" onSubmit={handlePasswordSave}>
        <h2 className="profile-section-title">Cambiar password</h2>
        <label className="profile-field">
          <span className="profile-label">Password actual</span>
          <div className="password-field">
            <input
              type={showCurrent ? 'text' : 'password'}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowCurrent((s) => !s)}
              aria-label={showCurrent ? 'Ocultar password' : 'Mostrar password'}
              tabIndex={-1}
            >
              {showCurrent ? '\uD83D\uDE48' : '\uD83D\uDC41'}
            </button>
          </div>
        </label>
        <label className="profile-field">
          <span className="profile-label">Nueva password</span>
          <div className="password-field">
            <input
              type={showNew ? 'text' : 'password'}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={4}
            />
            <button
              type="button"
              className="password-toggle"
              onClick={() => setShowNew((s) => !s)}
              aria-label={showNew ? 'Ocultar password' : 'Mostrar password'}
              tabIndex={-1}
            >
              {showNew ? '\uD83D\uDE48' : '\uD83D\uDC41'}
            </button>
          </div>
        </label>
        <label className="profile-field">
          <span className="profile-label">Confirmar nueva password</span>
          <input
            type={showNew ? 'text' : 'password'}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            minLength={4}
          />
        </label>
        <div className="profile-actions">
          <button type="submit" className="admin-btn primary" disabled={savingPassword}>
            {savingPassword ? 'Guardando...' : 'Cambiar password'}
          </button>
        </div>
      </form>
    </div>
  );
}
