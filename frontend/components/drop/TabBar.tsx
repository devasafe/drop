import { ComponentType } from 'react';
import { Home, Search, Receipt, User, LucideProps } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './TabBar.module.css';

export type TabKey = 'inicio' | 'buscar' | 'pedidos' | 'conta' | 'entrar';

export interface TabItem {
  key: TabKey;
  label: string;
  icon: ComponentType<LucideProps>;
}

export interface TabBarProps {
  active: TabKey;
  onNavigate: (key: TabKey) => void;
  /** Itens a exibir. Default = as 4 abas do cliente logado. Passe uma lista
   *  própria (ex.: convidado = Início/Buscar/Entrar) para outros contextos. */
  items?: TabItem[];
}

export const DEFAULT_TABS: TabItem[] = [
  { key: 'inicio', label: 'Início', icon: Home },
  { key: 'buscar', label: 'Buscar', icon: Search },
  { key: 'pedidos', label: 'Pedidos', icon: Receipt },
  { key: 'conta', label: 'Conta', icon: User },
];

/**
 * Navegação principal do app. Por padrão, as 4 abas do cliente logado; pode
 * receber uma lista própria via `items` (ex.: convidado = Início/Buscar/Entrar).
 * Replica `.tab`/`.tab .it.on` do mock canônico: item ativo em `--brand-2`,
 * resto em `--text-subtle`. Cada item é um `<button>` com `aria-label` próprio.
 */
export function TabBar({ active, onNavigate, items = DEFAULT_TABS }: TabBarProps) {
  return (
    <nav className={styles.tabBar} aria-label="Navegação principal">
      {items.map(({ key, label, icon: TabIcon }) => {
        const isActive = key === active;
        return (
          <button
            key={key}
            type="button"
            className={[styles.item, isActive && styles.on].filter(Boolean).join(' ')}
            aria-label={label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            <TabIcon size={21} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            <span className={styles.label}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
