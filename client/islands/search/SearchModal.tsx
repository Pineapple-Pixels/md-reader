import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Command } from 'cmdk';
import MiniSearch from 'minisearch';
import { apiFetch } from '@shared/api';
import type { SearchEntry } from '@shared/types';

export function SearchModal() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: entries = [] } = useQuery<SearchEntry[]>({
    queryKey: ['search-index'],
    queryFn: () => apiFetch('/search-index'),
    enabled: open,
  });

  const miniSearch = useMemo(() => {
    const ms = new MiniSearch<SearchEntry>({
      fields: ['title', 'content'],
      storeFields: ['file', 'title', 'content', 'public'],
      searchOptions: { fuzzy: 0.2, prefix: true, boost: { title: 3 } },
    });
    if (entries.length) ms.addAll(entries.map((e, i) => ({ ...e, id: i })));
    return ms;
  }, [entries]);

  const results = useMemo(() => {
    if (!query.trim()) return entries.slice(0, 20);
    return miniSearch.search(query).map((r) => entries[r.id as number]);
  }, [query, miniSearch, entries]);

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // Auto-focus + reset on open
  useEffect(() => {
    if (open) {
      setQuery('');
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  if (!open) return null;

  function navigate(file: string) {
    window.location.href = `/doc/${file}`;
  }

  function highlight(text: string, q: string) {
    if (!q.trim()) return text;
    const words = q.trim().split(/\s+/).filter(Boolean);
    const pattern = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    const re = new RegExp(`(${pattern})`, 'gi');
    const parts = text.split(re);
    return parts.map((part, i) =>
      re.test(part) ? <mark key={i} style={{ background: 'var(--warning-bg)', color: 'var(--text)', padding: '0 1px', borderRadius: 2 }}>{part}</mark> : part
    );
  }

  return (
    <div className="search-overlay" onClick={() => setOpen(false)}>
      <div className="search-dialog" onClick={(e) => e.stopPropagation()}>
        <Command shouldFilter={false} label="Buscar documentos">
          <Command.Input
            ref={inputRef}
            value={query}
            onValueChange={setQuery}
            placeholder="Buscar documentos..."
            className="search-input"
          />
          <Command.List className="search-list">
            {entries.length === 0 && query === '' && (
              <Command.Empty className="search-empty">Cargando...</Command.Empty>
            )}
            {entries.length > 0 && results.length === 0 && (
              <Command.Empty className="search-empty">Sin resultados para "{query}"</Command.Empty>
            )}
            {results.map((entry) => (
              <Command.Item
                key={entry.file}
                value={entry.file}
                onSelect={() => navigate(entry.file)}
                className="search-item"
              >
                <div className="search-item-header">
                  <span className="search-item-title">{highlight(entry.title, query)}</span>
                  {entry.public && <span className="search-badge">publico</span>}
                </div>
                <span className="search-item-path">{entry.file}</span>
                {query.trim() && entry.content && (
                  <span className="search-item-snippet">
                    {highlight(entry.content.slice(0, 120), query)}
                  </span>
                )}
              </Command.Item>
            ))}
          </Command.List>
          <div className="search-footer">
            <span><kbd>↑↓</kbd> navegar</span>
            <span><kbd>↵</kbd> abrir</span>
            <span><kbd>esc</kbd> cerrar</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
