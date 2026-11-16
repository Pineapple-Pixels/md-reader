import { useState, type FormEvent } from 'react';
import { THEME_COLOR_KEYS, readableOn, type AppTheme, type Base, type ThemeColorKey } from '@shared/design';
import { useTheme } from '../hooks/useTheme';
import { useToast } from '../hooks/useToast';

type Colors = Record<ThemeColorKey, string>;

/** The built-in palettes in app.css, so "Claro"/"Oscuro" can be shown and used as a starting point. */
const BUILT_IN: Record<Base, Colors> = {
  light: { bg: '#efebe4', surface: '#f6f3ee', text: '#141413', muted: '#6e6a63', accent: '#141413', border: '#d9d3c9' },
  dark: { bg: '#121211', surface: '#1a1918', text: '#ece8e1', muted: '#8f8a81', accent: '#ece8e1', border: '#2e2c29' },
};

const LABELS: Record<ThemeColorKey, string> = {
  bg: 'Fondo', surface: 'Paneles', text: 'Texto', muted: 'Texto suave', accent: 'Acento', border: 'Bordes',
};

const colorsOf = (t: AppTheme): Colors => t.tokens.colors ?? BUILT_IN[t.tokens.base];

/** What the built-in themes paint as accent: the active org's color (see app.css), ink without one. */
const BUILT_IN_ACCENT: Record<Base, string> = {
  light: `var(--org-accent, ${BUILT_IN.light.accent})`,
  dark: `color-mix(in oklab, var(--org-accent, ${BUILT_IN.dark.accent}) 70%, white)`,
};

function Swatch({ colors, accent = colors.accent }: { colors: Colors; accent?: string }) {
  return (
    <div className="theme-swatch" style={{ background: colors.bg, borderColor: colors.border }}>
      <span style={{ background: colors.surface, borderColor: colors.border }} />
      <span style={{ background: accent }} />
      <span style={{ background: colors.text }} />
    </div>
  );
}

type Draft = { id: string | null; name: string; base: Base; colors: Colors };

/** The user's app themes: pick one, or create/edit their own. Never affects documents. */
export function AppearanceSection() {
  const { themes, active, setActive, createTheme, updateTheme, deleteTheme } = useTheme();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  function startNew() {
    setDraft({ id: null, name: 'Mi tema', base: active.tokens.base, colors: { ...colorsOf(active) } });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setSaving(true);
    const input = { name: draft.name.trim(), tokens: { base: draft.base, colors: draft.colors } };
    try {
      if (draft.id) {
        await updateTheme(draft.id, input);
      } else {
        const created = await createTheme(input);
        setActive(created.id);
      }
      toast('Tema guardado', 'success');
      setDraft(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar el tema', 'error');
    }
    setSaving(false);
  }

  async function remove(t: AppTheme) {
    if (!confirm(`Borrar el tema "${t.name}"?`)) return;
    try {
      await deleteTheme(t.id);
      if (active.id === t.id) setActive('light');
      toast('Tema borrado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al borrar', 'error');
    }
  }

  return (
    <section className="profile-section">
      <h2 className="profile-section-title">Apariencia</h2>
      <p className="profile-hint">Cambia como ves la app (botones, menus, carpetas). Los documentos mantienen el diseno de tu organizacion.</p>

      <div className="theme-grid">
        {themes.map((t) => (
          <div key={t.id} className={`theme-card${t.id === active.id ? ' active' : ''}`}>
            <Swatch colors={colorsOf(t)} accent={t.tokens.colors ? undefined : BUILT_IN_ACCENT[t.tokens.base]} />
            <strong>{t.name}</strong>
            <div className="theme-card-actions">
              {t.id === active.id
                ? <span className="role-badge admin">En uso</span>
                : <button type="button" className="admin-btn small" onClick={() => setActive(t.id)}>Usar</button>}
              {t.custom && (
                <>
                  <button type="button" className="admin-btn small" onClick={() => setDraft({ id: t.id, name: t.name, base: t.tokens.base, colors: { ...colorsOf(t) } })}>Editar</button>
                  <button type="button" className="admin-btn small danger" onClick={() => remove(t)}>Borrar</button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {!draft && <div className="profile-actions"><button type="button" className="admin-btn primary" onClick={startNew}>+ Nuevo tema</button></div>}

      {draft && (
        <form className="theme-form" onSubmit={save}>
          <div className="theme-form-grid">
            <label className="profile-field">
              <span className="profile-label">Nombre</span>
              <input value={draft.name} maxLength={40} required onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className="profile-field">
              <span className="profile-label">Base</span>
              <select value={draft.base} onChange={(e) => setDraft({ ...draft, base: e.target.value as Base })}>
                <option value="light">Clara</option>
                <option value="dark">Oscura</option>
              </select>
            </label>
            {THEME_COLOR_KEYS.map((k) => (
              <label key={k} className="profile-field theme-color-field">
                <span className="profile-label">{LABELS[k]}</span>
                <input type="color" value={draft.colors[k]} onChange={(e) => setDraft({ ...draft, colors: { ...draft.colors, [k]: e.target.value } })} />
              </label>
            ))}
          </div>
          <div className="theme-preview" style={{ background: draft.colors.bg, color: draft.colors.text, borderColor: draft.colors.border }}>
            <div className="theme-preview-side" style={{ background: draft.colors.surface, borderColor: draft.colors.border }}>
              <span style={{ color: draft.colors.accent }}>Carpeta activa</span>
              <span style={{ color: draft.colors.muted }}>Otra carpeta</span>
            </div>
            <div className="theme-preview-main">
              <span>Vista previa</span>
              <button type="button" style={{ background: draft.colors.accent, color: readableOn(draft.colors.accent) }}>Boton</button>
            </div>
          </div>
          <div className="profile-actions">
            <button type="submit" className="admin-btn primary" disabled={saving}>{saving ? 'Guardando...' : 'Guardar tema'}</button>
            <button type="button" className="admin-btn" onClick={() => setDraft(null)}>Cancelar</button>
          </div>
        </form>
      )}
    </section>
  );
}
