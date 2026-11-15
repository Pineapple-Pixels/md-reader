import { z } from 'zod';
import { sql } from './db.js';
import {
  DEFAULT_DESIGN, DOC_COLOR_KEYS, THEME_COLOR_KEYS, TEXT_FONT_IDS, MONO_FONT_IDS, RADII, DENSITIES,
  PRESET_IDS, customThemeRef,
} from '../../shared/design.js';
import type { OrgDesign, ThemeTokens, AppTheme } from '../../shared/design.js';

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color invalido (usar #rrggbb)').transform((s) => s.toLowerCase());
const colorsOf = <K extends string>(keys: readonly K[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, hex])) as Record<K, typeof hex>).strict();
const base = z.enum(['light', 'dark']);

export const OrgDesignSchema = z.object({
  base,
  colors: colorsOf(DOC_COLOR_KEYS),
  fonts: z.object({
    body: z.enum(TEXT_FONT_IDS as [string, ...string[]]),
    heading: z.enum(TEXT_FONT_IDS as [string, ...string[]]),
    mono: z.enum(MONO_FONT_IDS as [string, ...string[]]),
  }).strict(),
  radius: z.enum(RADII),
  density: z.enum(DENSITIES),
}).strict();

export const ThemeTokensSchema = z.object({
  base,
  colors: colorsOf(THEME_COLOR_KEYS),
}).strict();

export const ThemeBodySchema = z.object({
  name: z.string().trim().min(1).max(40),
  tokens: ThemeTokensSchema,
}).strict();

export const MAX_THEMES_PER_USER = 20;

// ---------- Organization design ----------

/** Stored designs that no longer validate (e.g. a removed font) fall back to the default. */
export function readDesign(stored: unknown): OrgDesign {
  const parsed = OrgDesignSchema.safeParse(stored);
  return parsed.success ? (parsed.data as OrgDesign) : DEFAULT_DESIGN;
}

export async function getOrgBrand(orgSlug: string): Promise<{ name: string; design: OrgDesign; logo: string | null } | null> {
  const rows = await sql<{ name: string; design: unknown; logo: string | null }[]>`
    SELECT name, design, logo FROM organizations WHERE slug = ${orgSlug} LIMIT 1
  `;
  const row = rows[0];
  return row ? { name: row.name, design: readDesign(row.design), logo: row.logo } : null;
}

export async function saveOrgBrand(orgId: number, name: string, design: OrgDesign): Promise<void> {
  await sql`UPDATE organizations SET name = ${name}, design = ${sql.json(design)} WHERE id = ${orgId}`;
}

export async function setOrgLogo(orgId: number, logo: string | null): Promise<string | null> {
  const rows = await sql<{ old: string | null }[]>`
    UPDATE organizations o SET logo = ${logo}
    FROM (SELECT logo AS old FROM organizations WHERE id = ${orgId}) prev
    WHERE o.id = ${orgId}
    RETURNING prev.old
  `;
  return rows[0]?.old ?? null;
}

export const LOGO_MAX_BYTES = 512 * 1024;

/** Detects the image type from its first bytes; only raster formats, never SVG. */
export function sniffImage(buf: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export const LOGO_MIME = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' } as const;

// ---------- User themes ----------

type ThemeRow = { id: number; name: string; tokens: unknown };

export async function listUserThemes(userId: number): Promise<{ active: string; themes: AppTheme[] }> {
  const [rows, users] = await Promise.all([
    sql<ThemeRow[]>`SELECT id, name, tokens FROM user_themes WHERE user_id = ${userId} ORDER BY id`,
    sql<{ active_theme: string | null }[]>`SELECT active_theme FROM users WHERE id = ${userId}`,
  ]);
  const themes = rows.flatMap((r) => {
    const tokens = ThemeTokensSchema.safeParse(r.tokens);
    return tokens.success ? [{ id: customThemeRef(r.id), name: r.name, tokens: tokens.data as ThemeTokens, custom: true }] : [];
  });
  return { active: users[0]?.active_theme ?? 'light', themes };
}

export async function createUserTheme(userId: number, name: string, tokens: ThemeTokens): Promise<AppTheme | null> {
  const rows = await sql<{ id: number }[]>`
    INSERT INTO user_themes (user_id, name, tokens)
    SELECT ${userId}, ${name}, ${sql.json(tokens)}
    WHERE (SELECT COUNT(*) FROM user_themes WHERE user_id = ${userId}) < ${MAX_THEMES_PER_USER}
    RETURNING id
  `;
  return rows[0] ? { id: customThemeRef(rows[0].id), name, tokens, custom: true } : null;
}

export async function updateUserTheme(userId: number, id: number, name: string, tokens: ThemeTokens): Promise<boolean> {
  const r = await sql`UPDATE user_themes SET name = ${name}, tokens = ${sql.json(tokens)} WHERE id = ${id} AND user_id = ${userId}`;
  return r.count > 0;
}

export async function deleteUserTheme(userId: number, id: number): Promise<boolean> {
  const r = await sql`DELETE FROM user_themes WHERE id = ${id} AND user_id = ${userId}`;
  if (r.count > 0) {
    await sql`UPDATE users SET active_theme = NULL WHERE id = ${userId} AND active_theme = ${customThemeRef(id)}`;
  }
  return r.count > 0;
}

/** Accepts a preset id or `custom:<id>` of a theme this user owns. */
export async function setActiveTheme(userId: number, ref: string): Promise<boolean> {
  if (!PRESET_IDS.includes(ref)) {
    const m = /^custom:(\d{1,9})$/.exec(ref);
    if (!m) return false;
    const own = await sql`SELECT 1 FROM user_themes WHERE id = ${Number(m[1])} AND user_id = ${userId}`;
    if (own.count === 0) return false;
  }
  await sql`UPDATE users SET active_theme = ${ref} WHERE id = ${userId}`;
  return true;
}
