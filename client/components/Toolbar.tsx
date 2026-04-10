import { useTheme } from '../hooks/useTheme';

export type ToolbarAction =
  | { label: string; href: string; primary?: boolean; className?: string }
  | { label: string; onClick: () => void; primary?: boolean; className?: string };

interface ToolbarProps {
  actions: ToolbarAction[];
  children?: React.ReactNode;
}

export function Toolbar({ actions, children }: ToolbarProps) {
  const { isDark, toggle } = useTheme();

  return (
    <div className="toolbar">
      {actions.map((action, i) => {
        const cls = `${action.primary ? 'primary' : ''} ${action.className || ''}`.trim();
        if ('href' in action) {
          return <a key={i} href={action.href} className={cls || undefined}>{action.label}</a>;
        }
        return <button key={i} onClick={action.onClick} className={cls || undefined}>{action.label}</button>;
      })}
      {children}
      <button className="theme-toggle" onClick={toggle}>
        {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
      </button>
    </div>
  );
}
