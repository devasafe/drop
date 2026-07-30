import { ComponentType } from 'react';
import { Home, Search, Receipt, Wallet, User, LucideProps } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './TabBar.module.css';

export type TabKey = 'inicio' | 'buscar' | 'pedidos' | 'carteira' | 'perfil';

export interface TabBarProps {
  active: TabKey;
  onNavigate: (key: TabKey) => void;
}

const TABS: Array<{ key: TabKey; label: string; icon: ComponentType<LucideProps> }> = [
  { key: 'inicio', label: 'Início', icon: Home },
  { key: 'buscar', label: 'Buscar', icon: Search },
  { key: 'pedidos', label: 'Pedidos', icon: Receipt },
  { key: 'carteira', label: 'Carteira', icon: Wallet },
  { key: 'perfil', label: 'Perfil', icon: User },
];

/**
 * Navegação principal do app, 5 itens fixos. Replica `.tab`/`.tab .it.on`
 * do mock canônico: item ativo em `--brand-2`, resto em `--text-subtle`.
 * Cada item é um `<button>` com `aria-label` próprio (não depende só do
 * texto visível para nome acessível).
 */
export function TabBar({ active, onNavigate }: TabBarProps) {
  return (
    <nav className={styles.tabBar} aria-label="Navegação principal">
      {TABS.map(({ key, label, icon: TabIcon }) => {
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
