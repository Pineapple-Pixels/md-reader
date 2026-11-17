import { useEffect, useRef, useState, type ReactNode } from 'react';

type ActionBase = {
  label: string;
  primary?: boolean;
  className?: string;
  /** With an icon, a non-primary action shows only the icon; the label becomes its accessible name and tooltip. */
  icon?: ReactNode;
  /** A small count drawn on the icon, e.g. comments. */
  badge?: number;
};
export type ToolbarItem =
  | (ActionBase & { href: string })
  | (ActionBase & { onClick: () => void });
/** A button, a link, or a menu that groups secondary actions. */
export type ToolbarAction = ToolbarItem | (ActionBase & { menu: ToolbarItem[] });

interface ToolbarProps {
  actions: ToolbarAction[];
  children?: React.ReactNode;
}

const iconOnly = (a: ActionBase) => Boolean(a.icon) && !a.primary;

function itemClass(a: ActionBase): string | undefined {
  return [a.primary && 'primary', iconOnly(a) && 'icon-only', a.className].filter(Boolean).join(' ') || undefined;
}

function iconAttrs(a: ActionBase) {
  return iconOnly(a) ? { 'aria-label': a.label, 'data-tip': a.label } : {};
}

function Content({ action }: { action: ActionBase }) {
  if (!action.icon) return <>{action.label}</>;
  if (action.primary) return <>{action.icon}<span>{action.label}</span></>;
  return <>{action.icon}{action.badge ? <span className="toolbar-badge" aria-hidden="true">{action.badge}</span> : null}</>;
}

function ToolbarMenu({ action }: { action: ActionBase & { menu: ToolbarItem[] } }) {
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
      <button aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={itemClass(action)} {...iconAttrs(action)}>
        {action.icon ? <Content action={action} /> : <>{action.label} <span aria-hidden="true" className="toolbar-caret">+</span></>}
      </button>
      {open && (
        <div className="toolbar-menu-list" role="menu" aria-label={action.label}>
          {action.menu.map((item) => ('href' in item ? (
            <a key={item.label} role="menuitem" href={item.href} className={item.className}>{item.label}</a>
          ) : (
            <button key={item.label} role="menuitem" className={item.className} onClick={() => { setOpen(false); item.onClick(); }}>
              {item.label}
            </button>
          )))}
        </div>
      )}
    </div>
  );
}

export function Toolbar({ actions, children }: ToolbarProps) {
  return (
    <div className="toolbar" data-noprint>
      {actions.map((action) => {
        if ('menu' in action) return action.menu.length > 0 ? <ToolbarMenu key={action.label} action={action} /> : null;
        if ('href' in action) {
          return <a key={action.label} href={action.href} className={itemClass(action)} {...iconAttrs(action)}><Content action={action} /></a>;
        }
        return (
          <button key={action.label} onClick={action.onClick} className={itemClass(action)} {...iconAttrs(action)}>
            <Content action={action} />
          </button>
        );
      })}
      {children}
    </div>
  );
}
