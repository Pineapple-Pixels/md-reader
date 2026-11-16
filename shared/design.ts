/**
 * Two independent visual layers:
 *  - OrgDesign: how an organization's documents look (applied to `.doc` via --doc-* tokens).
 *  - AppTheme: how the app chrome looks for one user (applied to :root app tokens). Never touches documents.
 */

export type Base = 'light' | 'dark';

// ---------- Fonts ----------

export type FontDef = { id: string; label: string; stack: string; kind: 'text' | 'mono'; google?: string };

/** `google` = Google Fonts family query; absent when the font ships with the app bundle. */
export const FONTS: readonly FontDef[] = [
  { id: 'dm-sans', label: 'DM Sans', stack: "'DM Sans', system-ui, sans-serif", kind: 'text' },
  { id: 'space-grotesk', label: 'Space Grotesk', stack: "'Space Grotesk', 'DM Sans', sans-serif", kind: 'text' },
  { id: 'inter', label: 'Inter', stack: "'Inter', system-ui, sans-serif", kind: 'text', google: 'Inter:wght@400;600;700' },
  { id: 'ibm-plex-sans', label: 'IBM Plex Sans', stack: "'IBM Plex Sans', system-ui, sans-serif", kind: 'text', google: 'IBM+Plex+Sans:wght@400;600;700' },
  { id: 'merriweather', label: 'Merriweather', stack: "'Merriweather', Georgia, serif", kind: 'text', google: 'Merriweather:wght@400;700' },
  { id: 'lora', label: 'Lora', stack: "'Lora', Georgia, serif", kind: 'text', google: 'Lora:wght@400;600;700' },
  { id: 'source-serif', label: 'Source Serif 4', stack: "'Source Serif 4', Georgia, serif", kind: 'text', google: 'Source+Serif+4:wght@400;600;700' },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', stack: "'JetBrains Mono', ui-monospace, monospace", kind: 'mono' },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', stack: "'IBM Plex Mono', ui-monospace, monospace", kind: 'mono', google: 'IBM+Plex+Mono:wght@400;600' },
  { id: 'fira-code', label: 'Fira Code', stack: "'Fira Code', ui-monospace, monospace", kind: 'mono', google: 'Fira+Code:wght@400;600' },
];

export const TEXT_FONT_IDS = FONTS.filter((f) => f.kind === 'text').map((f) => f.id);
export const MONO_FONT_IDS = FONTS.filter((f) => f.kind === 'mono').map((f) => f.id);

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? FONTS[0]!;
}

// ---------- Organization document design ----------

export const DOC_COLOR_KEYS = ['bg', 'text', 'heading', 'link', 'border', 'codeBg', 'quote', 'tableHead'] as const;
export type DocColorKey = (typeof DOC_COLOR_KEYS)[number];

export const RADII = ['none', 'sm', 'md', 'lg'] as const;
export const DENSITIES = ['compact', 'comfortable'] as const;

export type OrgDesign = {
  base: Base;
  colors: Record<DocColorKey, string>;
  fonts: { body: string; heading: string; mono: string };
  radius: (typeof RADII)[number];
  density: (typeof DENSITIES)[number];
};

/** The look documents had before organizations could customize it. */
export const DEFAULT_DESIGN: OrgDesign = {
  base: 'light',
  colors: {
    bg: '#ffffff',
    text: '#1e2433',
    heading: '#1e2433',
    link: '#9e8245',
    border: '#dde0e8',
    codeBg: '#f2f4f8',
    quote: '#9e8245',
    tableHead: '#f2f4f8',
  },
  fonts: { body: 'dm-sans', heading: 'space-grotesk', mono: 'jetbrains-mono' },
  radius: 'md',
  density: 'comfortable',
};

export type OrgBrand = { name: string; design: OrgDesign; logoUrl: string | null };

/** Text color that stays readable on a solid `#rrggbb` background: dark ink or white, by WCAG luminance. */
export function readableOn(hex: string, ink = '#141413', light = '#ffffff'): string {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.179 ? ink : light;
}

// ---------- User app themes ----------

export const THEME_COLOR_KEYS = ['bg', 'surface', 'text', 'muted', 'accent', 'border'] as const;
export type ThemeColorKey = (typeof THEME_COLOR_KEYS)[number];

/** `colors: null` keeps the app's built-in palette for that base. */
export type ThemeTokens = { base: Base; colors: Record<ThemeColorKey, string> | null };

export type AppTheme = { id: string; name: string; tokens: ThemeTokens; custom?: boolean };

export const THEME_PRESETS: readonly AppTheme[] = [
  { id: 'light', name: 'Claro', tokens: { base: 'light', colors: null } },
  { id: 'dark', name: 'Oscuro', tokens: { base: 'dark', colors: null } },
  {
    id: 'white-red', name: 'Blanco y rojo',
    tokens: { base: 'light', colors: { bg: '#ffffff', surface: '#fff6f6', text: '#1f1a1a', muted: '#7d6b6b', accent: '#d32f2f', border: '#f1d6d6' } },
  },
  {
    id: 'black-violet', name: 'Negro y violeta',
    tokens: { base: 'dark', colors: { bg: '#0b0a10', surface: '#16131f', text: '#e8e4f5', muted: '#8b84a3', accent: '#8b5cf6', border: '#2a2438' } },
  },
  {
    id: 'forest', name: 'Bosque',
    tokens: { base: 'light', colors: { bg: '#f6f8f4', surface: '#ffffff', text: '#1d2a20', muted: '#6b7a6e', accent: '#2f7d4f', border: '#d5dfd6' } },
  },
  {
    id: 'ocean', name: 'Oceano',
    tokens: { base: 'dark', colors: { bg: '#0b1320', surface: '#111c2e', text: '#dbe7f5', muted: '#7d8ea6', accent: '#38bdf8', border: '#1f2d44' } },
  },
];

export const PRESET_IDS = THEME_PRESETS.map((t) => t.id);

/** Stored active-theme value for a custom theme. */
export const customThemeRef = (id: number): string => `custom:${id}`;
