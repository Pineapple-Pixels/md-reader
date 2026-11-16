import { createContext, useContext, useState, useCallback, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@shared/api';
import { THEME_PRESETS, THEME_COLOR_KEYS, readableOn, type AppTheme, type ThemeTokens } from '@shared/design';
import { useOrgBrand } from '../components/DocFrame';
import { useAuth } from './useAuth';

// App theme = how the app chrome looks for this user. Documents are styled by their org (DocFrame).

const CACHE_TOKENS = 'app-theme';
const CACHE_ID = 'app-theme-id';
const CACHE_ORG_ACCENT = 'org-accent';

function applyOrgAccent(accent: string | null): void {
  const style = document.documentElement.style;
  if (accent) {
    style.setProperty('--org-accent', accent);
    style.setProperty('--org-on-accent', readableOn(accent));
  } else {
    style.removeProperty('--org-accent');
    style.removeProperty('--org-on-accent');
  }
}

export function applyTheme(tokens: ThemeTokens): void {
  const root = document.documentElement;
  // Hover transitions would otherwise animate every themed color, including controls inside the document.
  root.classList.add('theme-switching');
  root.classList.toggle('dark', tokens.base === 'dark');
  root.classList.toggle('themed', tokens.colors !== null);
  for (const k of THEME_COLOR_KEYS) {
    if (tokens.colors) root.style.setProperty(`--t-${k}`, tokens.colors[k]);
    else root.style.removeProperty(`--t-${k}`);
  }
  if (tokens.colors) root.style.setProperty('--t-on-accent', readableOn(tokens.colors.accent));
  else root.style.removeProperty('--t-on-accent');
  void getComputedStyle(root).color; // commit the new colors while transitions are off
  root.classList.remove('theme-switching');
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

/** Applies the last theme before React renders, so a reload does not flash the default palette. */
export function applyCachedTheme(): void {
  const accent = readStorage(CACHE_ORG_ACCENT);
  if (accent && /^#[0-9a-f]{6}$/i.test(accent)) applyOrgAccent(accent);
  const raw = readStorage(CACHE_TOKENS);
  if (!raw) return;
  try { applyTheme(JSON.parse(raw) as ThemeTokens); } catch { /* corrupt cache: keep defaults */ }
}

function cacheTheme(theme: AppTheme): void {
  try {
    localStorage.setItem(CACHE_TOKENS, JSON.stringify(theme.tokens));
    localStorage.setItem(CACHE_ID, theme.id);
    localStorage.setItem('theme', theme.tokens.base); // read by the inline script in index.html
  } catch { /* storage blocked: theme still applies for this page */ }
}

type ThemeInput = { name: string; tokens: ThemeTokens };

interface ThemeCtx {
  themes: AppTheme[];
  active: AppTheme;
  setActive: (id: string) => void;
  createTheme: (t: ThemeInput) => Promise<AppTheme>;
  updateTheme: (id: string, t: ThemeInput) => Promise<void>;
  deleteTheme: (id: string) => Promise<void>;
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx | null>(null);

function readCachedTheme(): AppTheme | null {
  const id = readStorage(CACHE_ID);
  const raw = readStorage(CACHE_TOKENS);
  if (!id || !raw) return null;
  try { return { id, name: '', tokens: JSON.parse(raw) as ThemeTokens }; } catch { return null; }
}

/** Forgets this browser's theme so the next person signing in does not inherit it. */
export function clearCachedTheme(): void {
  try {
    for (const k of [CACHE_TOKENS, CACHE_ID, CACHE_ORG_ACCENT, 'theme']) localStorage.removeItem(k);
  } catch { /* storage blocked: nothing cached */ }
}

const initialId = (): string => readStorage(CACHE_ID) ?? (readStorage('theme') === 'dark' ? 'dark' : 'light');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading: authLoading, org } = useAuth();
  const queryClient = useQueryClient();
  const brand = useOrgBrand(org?.slug);
  const orgAccent = brand.data?.design.colors.link ?? null;
  // Until auth and the brand load, keep the accent applyCachedTheme painted.
  const accentSettled = !authLoading && (!org || !brand.isPending);

  // The built-in themes paint their accent with the active org's color; themes with their own colors keep theirs.
  useEffect(() => {
    if (!accentSettled) return;
    applyOrgAccent(orgAccent);
    try {
      if (orgAccent) localStorage.setItem(CACHE_ORG_ACCENT, orgAccent);
      else localStorage.removeItem(CACHE_ORG_ACCENT);
    } catch { /* storage blocked: accent still applies for this page */ }
  }, [accentSettled, orgAccent]);
  const { data } = useQuery({
    queryKey: ['themes'],
    queryFn: () => apiFetch<{ active: string; themes: AppTheme[] }>('/me/themes'),
    enabled: isAuthenticated,
  });
  const [activeId, setActiveId] = useState(initialId);
  const [cached] = useState(readCachedTheme);

  // The account's choice wins over this browser's cache once it loads.
  useEffect(() => {
    if (data) setActiveId(data.active);
  }, [data]);

  const themes = useMemo(() => [...THEME_PRESETS, ...(data?.themes ?? [])], [data]);
  // A custom theme only arrives with /me/themes; until then keep what applyCachedTheme painted.
  const active = themes.find((t) => t.id === activeId)
    ?? (!data && cached?.id === activeId ? cached : undefined)
    ?? THEME_PRESETS[0]!;

  useEffect(() => {
    applyTheme(active.tokens);
    cacheTheme(active);
  }, [active]);

  const setActive = useCallback((id: string) => {
    setActiveId(id);
    if (isAuthenticated) {
      void apiFetch('/me/active-theme', { method: 'PUT', body: JSON.stringify({ id }) })
        .then(() => queryClient.invalidateQueries({ queryKey: ['themes'] }));
    }
  }, [isAuthenticated, queryClient]);

  const refresh = useCallback(() => queryClient.invalidateQueries({ queryKey: ['themes'] }), [queryClient]);

  const createTheme = useCallback(async (t: ThemeInput) => {
    const created = await apiFetch<AppTheme>('/me/themes', { method: 'POST', body: JSON.stringify(t) });
    await refresh();
    return created;
  }, [refresh]);

  const updateTheme = useCallback(async (id: string, t: ThemeInput) => {
    await apiFetch(`/me/themes/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(t) });
    await refresh();
  }, [refresh]);

  const deleteTheme = useCallback(async (id: string) => {
    await apiFetch(`/me/themes/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await refresh();
  }, [refresh]);

  const isDark = active.tokens.base === 'dark';
  const toggle = useCallback(() => setActive(isDark ? 'light' : 'dark'), [isDark, setActive]);

  const value = useMemo(
    () => ({ themes, active, setActive, createTheme, updateTheme, deleteTheme, isDark, toggle }),
    [themes, active, setActive, createTheme, updateTheme, deleteTheme, isDark, toggle],
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>');
  return ctx;
}
