import { ReactNode } from 'react';
import { Chip } from '../ui/Chip';
import styles from './CategoryRail.module.css';

export interface Category {
  id: string;
  label: string;
  icon: ReactNode;
}

export interface CategoryRailProps {
  categories: Category[];
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * Trilha de categorias com scroll horizontal, chips inline (ícone + texto)
 * via `Chip`. Replica `.cats` do mock canônico — **não** é icon-box (spec
 * §3.1-F): cada categoria é uma pílula, nunca um quadrado de ícone isolado.
 */
export function CategoryRail({ categories, activeId, onSelect }: CategoryRailProps) {
  return (
    <div className={styles.rail}>
      {categories.map((category) => (
        <Chip
          key={category.id}
          icon={category.icon}
          label={category.label}
          active={category.id === activeId}
          onClick={() => onSelect(category.id)}
        />
      ))}
    </div>
  );
}
