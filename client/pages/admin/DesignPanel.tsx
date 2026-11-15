import { useEffect, useState, type ChangeEvent } from 'react';
import {
  DEFAULT_DESIGN, DOC_COLOR_KEYS, FONTS, RADII, DENSITIES,
  type DocColorKey, type OrgDesign,
} from '@shared/design';
import { useAuth } from '../../hooks/useAuth';
import { DocFrame, useOrgBrand } from '../../components/DocFrame';
import { adminFetch, type PanelProps } from './helpers';

const COLOR_LABELS: Record<DocColorKey, string> = {
  bg: 'Fondo', text: 'Texto', heading: 'Titulos', link: 'Links',
  border: 'Bordes', codeBg: 'Fondo de codigo', quote: 'Citas', tableHead: 'Encabezado de tablas',
};
const RADIUS_LABELS: Record<OrgDesign['radius'], string> = { none: 'Rectos', sm: 'Poco redondeado', md: 'Redondeado', lg: 'Muy redondeado' };
const DENSITY_LABELS: Record<OrgDesign['density'], string> = { compact: 'Compacta', comfortable: 'Comoda' };

// Static sample shown in the live preview (trusted markup, not user content).
const SAMPLE_HTML = `
<h1>Guia de la catedra</h1>
<p>Este es un documento de ejemplo con <a href="#">un link</a>, <strong>negrita</strong> y <code>codigo</code>.</p>
<h2>Cronograma</h2>
<table><thead><tr><th>Semana</th><th>Tema</th></tr></thead><tbody><tr><td>1</td><td>Introduccion</td></tr><tr><td>2</td><td>Practica</td></tr></tbody></table>
<blockquote>Una cita destacada del material.</blockquote>
<pre><code>const nota = 10;</code></pre>`;

/** How the organization's documents look. Only org admins reach it (admin API checks the role). */
export function DesignPanel({ toast, queryClient }: PanelProps) {
  const { org } = useAuth();
  const { data, isLoading } = useOrgBrand(org?.slug);
  const [name, setName] = useState('');
  const [design, setDesign] = useState<OrgDesign | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data && design === null) {
      setName(data.name);
      setDesign(data.design);
    }
  }, [data, design]);

  if (isLoading || !design || !org) return <p className="loading-msg">Cargando diseno...</p>;

  const set = (patch: Partial<OrgDesign>) => setDesign({ ...design, ...patch });
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['org-design', org.slug] }),
    queryClient.invalidateQueries({ queryKey: ['auth'] }),
  ]);

  async function save() {
    setSaving(true);
    try {
      await adminFetch('/design', { method: 'PUT', body: JSON.stringify({ name: name.trim(), design }) });
      await refresh();
      toast('Diseno guardado', 'success');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Error al guardar', 'error');
    }
    setSaving(false);
  }

  async function uploadLogo(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      await adminFetch('/logo', { method: 'PUT', body: file, headers: { 'Content-Type': file.type } });
      await refresh();
      toast('Logo actualizado', 'success');
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      toast(
        msg.includes('413') ? 'El logo supera 512 KB'
          : msg.includes('400') ? 'El logo tiene que ser PNG, JPEG o WebP'
          : 'No se pudo subir el logo',
        'error',
      );
    }
  }

  async function removeLogo() {
    await adminFetch('/logo', { method: 'DELETE' });
    await refresh();
  }

  const fontSelect = (slot: keyof OrgDesign['fonts'], kind: 'text' | 'mono') => (
    <select value={design.fonts[slot]} onChange={(e) => set({ fonts: { ...design.fonts, [slot]: e.target.value } })}>
      {FONTS.filter((f) => f.kind === kind).map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
    </select>
  );

  return (
    <div className="design-layout">
      <div className="design-form">
        <p className="profile-hint">Asi se ven todos los documentos de tu organizacion (privados, de teams y publicos). Cada persona puede elegir su propio tema para la app, pero no cambia los documentos.</p>

        <fieldset>
          <legend>Identidad</legend>
          <label style={{ gridColumn: '1 / -1' }}>Nombre
            <input type="text" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
          </label>
          <label style={{ gridColumn: '1 / -1' }}>Logo (PNG, JPEG o WebP, max 512 KB)
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={uploadLogo} />
          </label>
          {data?.logoUrl && <button type="button" className="admin-btn small" onClick={removeLogo}>Quitar logo</button>}
        </fieldset>

        <fieldset>
          <legend>Colores</legend>
          <label style={{ gridColumn: '1 / -1' }}>Base (resaltado de codigo)
            <select value={design.base} onChange={(e) => set({ base: e.target.value as OrgDesign['base'] })}>
              <option value="light">Clara</option>
              <option value="dark">Oscura</option>
            </select>
          </label>
          {DOC_COLOR_KEYS.map((k) => (
            <label key={k}>{COLOR_LABELS[k]}
              <input type="color" value={design.colors[k]} onChange={(e) => set({ colors: { ...design.colors, [k]: e.target.value } })} />
            </label>
          ))}
        </fieldset>

        <fieldset>
          <legend>Tipografias</legend>
          <label>Texto{fontSelect('body', 'text')}</label>
          <label>Titulos{fontSelect('heading', 'text')}</label>
          <label style={{ gridColumn: '1 / -1' }}>Codigo{fontSelect('mono', 'mono')}</label>
        </fieldset>

        <fieldset>
          <legend>Forma</legend>
          <label>Bordes
            <select value={design.radius} onChange={(e) => set({ radius: e.target.value as OrgDesign['radius'] })}>
              {RADII.map((r) => <option key={r} value={r}>{RADIUS_LABELS[r]}</option>)}
            </select>
          </label>
          <label>Densidad
            <select value={design.density} onChange={(e) => set({ density: e.target.value as OrgDesign['density'] })}>
              {DENSITIES.map((d) => <option key={d} value={d}>{DENSITY_LABELS[d]}</option>)}
            </select>
          </label>
        </fieldset>

        <div className="profile-actions">
          <button type="button" className="admin-btn primary" onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Guardando...' : 'Guardar diseno'}
          </button>
          <button type="button" className="admin-btn" onClick={() => setDesign(DEFAULT_DESIGN)}>Restablecer</button>
        </div>
      </div>

      <div>
        <div className="design-preview-label">Vista previa</div>
        <DocFrame org={org.slug} preview={{ name, design, logoUrl: data?.logoUrl ?? null }}>
          <div className="doc" dangerouslySetInnerHTML={{ __html: SAMPLE_HTML }} />
        </DocFrame>
      </div>
    </div>
  );
}
