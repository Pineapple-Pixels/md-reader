import { useEffect, useRef, useState } from 'react';
import { useTheme } from '../hooks/useTheme';

type ActionBase = { label: string; primary?: boolean; className?: string };
export type ToolbarItem =
  | (ActionBase & { href: string })
  | (ActionBase & { onClick: () => void });
/** A button, a link, or a menu that groups secondary actions. */
export type ToolbarAction = ToolbarItem | (ActionBase & { menu: ToolbarItem[] });

interface ToolbarProps {
  actions: ToolbarAction[];
  children?: React.ReactNode;
}

function itemClass(a: ActionBase): string | undefined {
  return `${a.primary ? 'primary' : ''} ${a.className || ''}`.trim() || undefined;
}

function ToolbarMenu({ label, items }: { label: string; items: ToolbarItem[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false); }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="toolbar-menu" ref={ref}>
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        {label} <span aria-hidden="true" className="toolbar-caret">+</span>
      </button>
      {open && (
        <div className="toolbar-menu-list" role="menu" aria-label={label}>
          {items.map((item) => ('href' in item ? (
            <a key={item.label} role="menuitem" href={item.href} className={itemClass(item)}>{item.label}</a>
          ) : (
            <button key={item.label} role="menuitem" className={itemClass(item)} onClick={() => { setOpen(false); item.onClick(); }}>
              {item.label}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ actions, children }: ToolbarProps) {
  const { isDark, toggle } = useTheme();

  return (
    <div className="toolbar" data-noprint>
      {actions.map((action) => {
        if ('menu' in action) return action.menu.length > 0 ? <ToolbarMenu key={action.label} label={action.label} items={action.menu} /> : null;
        if ('href' in action) return <a key={action.label} href={action.href} className={itemClass(action)}>{action.label}</a>;
        return <button key={action.label} onClick={action.onClick} className={itemClass(action)}>{action.label}</button>;
      })}
      {children}
      <button className="theme-toggle" onClick={toggle} aria-label={isDark ? 'Pasar a tema claro' : 'Pasar a tema oscuro'}>
        {isDark ? 'Claro' : 'Oscuro'}
      </button>
    </div>
  );
}
