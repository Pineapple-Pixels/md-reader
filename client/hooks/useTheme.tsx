import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

interface ThemeCtx {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));

  const toggle = useCallback(() => {
    setIsDark((prev) => {
      const next = !prev;
      document.documentElement.classList.toggle('dark', next);
      localStorage.setItem('theme', next ? 'dark' : 'light');
      // Sync highlight.js themes
      const light = document.getElementById('hljs-light') as HTMLLinkElement | null;
      const dark = document.getElementById('hljs-dark') as HTMLLinkElement | null;
      if (light) light.disabled = next;
      if (dark) dark.disabled = !next;
      return next;
    });
  }, []);

  // Sync hljs on mount
  useEffect(() => {
    const light = document.getElementById('hljs-light') as HTMLLinkElement | null;
    const dark = document.getElementById('hljs-dark') as HTMLLinkElement | null;
    if (light) light.disabled = isDark;
    if (dark) dark.disabled = !isDark;
  }, [isDark]);

  return <ThemeContext.Provider value={{ isDark, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
